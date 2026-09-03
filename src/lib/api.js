import { supabase } from "./supabaseClient";

// ---------- helpers ----------
async function currentUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("Not signed in.");
  return data.user.id;
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

// ---------- profile ----------
export const profileApi = {
  async get() {
    const userId = await currentUserId();
    return unwrap(await supabase.from("profiles").select("*").eq("id", userId).single());
  },
  async update(fields) {
    const userId = await currentUserId();
    return unwrap(await supabase.from("profiles").update(fields).eq("id", userId).select().single());
  },
};

// ---------- generic factory for simple owner-scoped tables ----------
// toDb/fromDb let each table translate between the UI's camelCase shape
// and the database's snake_case columns.
function makeCrud(table, { toDb = (x) => x, fromDb = (x) => x, defaultOrder = "created_at" } = {}) {
  return {
    async list() {
      const rows = unwrap(await supabase.from(table).select("*").order(defaultOrder, { ascending: false }));
      return rows.map(fromDb);
    },
    async create(fields) {
      const userId = await currentUserId();
      const row = unwrap(
        await supabase.from(table).insert({ ...toDb(fields), user_id: userId }).select().single()
      );
      return fromDb(row);
    },
    async update(id, fields) {
      const row = unwrap(await supabase.from(table).update(toDb(fields)).eq("id", id).select().single());
      return fromDb(row);
    },
    async remove(id) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
  };
}

export const clientsApi = makeCrud("clients"); // column names already match the UI shape

export const projectsApi = makeCrud("projects", {
  toDb: ({ clientId, start, paymentStatus, ...rest }) => ({
    ...rest,
    client_id: clientId,
    start_date: start,
    payment_status: paymentStatus,
  }),
  fromDb: ({ client_id, start_date, payment_status, ...rest }) => ({
    ...rest,
    clientId: client_id,
    start: start_date,
    paymentStatus: payment_status,
  }),
});

export const tasksApi = makeCrud("tasks", {
  toDb: ({ projectId, ...rest }) => ({ ...rest, project_id: projectId }),
  fromDb: ({ project_id, ...rest }) => ({ ...rest, projectId: project_id }),
});

export const expensesApi = makeCrud("expenses"); // column names already match the UI shape

// ---------- invoices (has a related invoice_items table) ----------
function invoiceFromDb(inv) {
  return {
    id: inv.id,
    clientId: inv.client_id,
    number: inv.number,
    date: inv.date,
    due: inv.due_date,
    tax: inv.tax,
    discount: inv.discount,
    status: inv.status,
    items: (inv.invoice_items || []).map((it) => ({
      id: it.id,
      desc: it.description,
      qty: it.quantity,
      rate: it.rate,
    })),
  };
}

export const invoicesApi = {
  async list() {
    const invoices = unwrap(
      await supabase.from("invoices").select("*, invoice_items(*)").order("date", { ascending: false })
    );
    return invoices.map(invoiceFromDb);
  },

  async create({ items, due, clientId, ...fields }) {
    const userId = await currentUserId();
    const invoice = unwrap(
      await supabase
        .from("invoices")
        .insert({ ...fields, client_id: clientId, due_date: due, user_id: userId })
        .select()
        .single()
    );
    if (items?.length) {
      const rows = items.map((it) => ({
        invoice_id: invoice.id,
        description: it.desc,
        quantity: it.qty,
        rate: it.rate,
      }));
      unwrap(await supabase.from("invoice_items").insert(rows).select());
    }
    return invoiceFromDb({ ...invoice, invoice_items: rowsOrEmpty(items) });
  },

  async update(id, { items, due, clientId, ...fields }) {
    const invoice = unwrap(
      await supabase
        .from("invoices")
        .update({ ...fields, client_id: clientId, due_date: due })
        .eq("id", id)
        .select()
        .single()
    );
    let savedItems = items;
    if (items?.length) {
      // Simplest correct approach: replace all line items on edit
      await supabase.from("invoice_items").delete().eq("invoice_id", id);
      const rows = items.map((it) => ({
        invoice_id: id,
        description: it.desc,
        quantity: it.qty,
        rate: it.rate,
      }));
      savedItems = unwrap(await supabase.from("invoice_items").insert(rows).select());
      savedItems = savedItems.map((it) => ({ desc: it.description, qty: it.quantity, rate: it.rate }));
    }
    return invoiceFromDb({ ...invoice, invoice_items: rowsOrEmpty(savedItems) });
  },

  async remove(id) {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw error;
  },
};

function rowsOrEmpty(items) {
  return (items || []).map((it) => ({ description: it.desc, quantity: it.qty, rate: it.rate }));
}

// ---------- attachments (files stored in Supabase Storage) ----------
const ATTACHMENTS_BUCKET = "attachments";

export const attachmentsApi = {
  async list(entityType, entityId) {
    return unwrap(
      await supabase
        .from("attachments")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
    );
  },

  async upload(file, entityType, entityId) {
    const userId = await currentUserId();
    const cleanName = file.name.replace(/[^\w.\-]/g, "_");
    const path = `${userId}/${entityType}/${entityId}/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file);
    if (uploadError) throw uploadError;

    return unwrap(
      await supabase
        .from("attachments")
        .insert({
          user_id: userId,
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          storage_path: path,
          file_size: file.size,
          mime_type: file.type,
        })
        .select()
        .single()
    );
  },

  async remove(attachment) {
    const { error: storageError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([attachment.storage_path]);
    if (storageError) throw storageError;
    const { error } = await supabase.from("attachments").delete().eq("id", attachment.id);
    if (error) throw error;
  },

  async signedUrl(storagePath, expiresInSeconds = 60) {
    const { data, error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  },
};

// ---------- fetch everything a signed-in user needs, in parallel ----------
export async function loadAllData() {
  const [clients, projects, tasks, invoices, expenses] = await Promise.all([
    clientsApi.list(),
    projectsApi.list(),
    tasksApi.list(),
    invoicesApi.list(),
    expensesApi.list(),
  ]);
  return { clients, projects, tasks, invoices, expenses };
}
