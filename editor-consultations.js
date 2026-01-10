const CONSULT_TABLE = "consultations";

const setMessage = (el, text, type = "") => {
  if (!el) {
    return;
  }
  el.textContent = text;
  el.classList.toggle("is-visible", Boolean(text));
  el.classList.toggle("is-error", type === "error");
};

const formatDate = (value) => {
  if (!value) {
    return "Unknown date";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return parsed.toLocaleString();
};

const buildContactLine = (row) => {
  const parts = [row.email, row.phone].filter(Boolean);
  return parts.join(" | ");
};

const normalizeRecords = (records) => {
  if (!records) {
    return "";
  }
  if (Array.isArray(records)) {
    return records.filter(Boolean).join(", ");
  }
  return String(records);
};

export const initConsultationsPage = ({ state }) => {
  const panel = document.querySelector("[data-consultations-panel]");
  const list = document.getElementById("consultationsPageList");
  const message = document.getElementById("consultationsPageMessage");
  const refreshBtn = document.getElementById("consultationsPageRefresh");

  const render = (rows) => {
    if (!list) {
      return;
    }
    if (!rows.length) {
      list.innerHTML = "<p class=\"tiny\">No requests yet.</p>";
      return;
    }
    list.innerHTML = rows
      .map((row) => {
        const name = row.name || row.full_name || "Unnamed request";
        const createdAt = formatDate(row.created_at);
        const contactLine = buildContactLine(row);
        const preferred = row.contact || "";
        const specialty = row.specialty || "";
        const messageText = row.message || row.concern || "";
        const records = normalizeRecords(row.records);
        const status = row.status || "new";
        const source = row.source || "web";
        const id = row.id || "";
        const isRejected = String(status).toLowerCase() === "rejected";

        return `
          <div class="consult-admin-item${isRejected ? " is-rejected" : ""}" data-consult-id="${id}">
            <div class="consult-admin-head">
              <strong>${name}</strong>
              <span class="consult-admin-date">${createdAt}</span>
            </div>
            <div class="consult-admin-grid">
              <div>
                <span class="consult-admin-label">Contact</span>
                <span>${contactLine || "Not provided"}</span>
              </div>
              <div>
                <span class="consult-admin-label">Preferred</span>
                <span>${preferred || "Not set"}</span>
              </div>
              <div>
                <span class="consult-admin-label">Specialty</span>
                <span>${specialty || "Not set"}</span>
              </div>
              <div>
                <span class="consult-admin-label">Status</span>
                <span class="consult-admin-status${isRejected ? " is-rejected" : ""}">${status}</span>
              </div>
              <div>
                <span class="consult-admin-label">Source</span>
                <span>${source}</span>
              </div>
              <div>
                <span class="consult-admin-label">Request ID</span>
                <span class="consult-admin-id">${id || "-"}</span>
              </div>
            </div>
            ${messageText ? `<div class="consult-admin-message">${messageText}</div>` : ""}
            ${records ? `<div class="consult-admin-records"><strong>Records:</strong> ${records}</div>` : ""}
            <div class="consult-admin-actions">
              ${
                isRejected
                  ? ""
                  : '<button class="btn ghost consult-admin-action" type="button" data-action="reject">Reject</button>'
              }
              <button class="btn ghost consult-admin-action" type="button" data-action="delete">Delete</button>
            </div>
          </div>
        `;
      })
      .join("");
  };

  const load = async () => {
    if (!panel) {
      return;
    }
    if (!state.supabaseClient) {
      setMessage(message, "Connect Supabase to load consultation requests.", "error");
      render([]);
      return;
    }
    let response = await state.supabaseClient
      .from(CONSULT_TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (response.error) {
      response = await state.supabaseClient.from(CONSULT_TABLE).select("*");
    }
    if (response.error) {
      setMessage(message, "Unable to load consultation requests.", "error");
      return;
    }
    setMessage(message, "");
    render(response.data || []);
  };

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      load();
    });
  }

  if (list) {
    list.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) {
        return;
      }
      const item = button.closest("[data-consult-id]");
      const id = item?.dataset.consultId || "";
      if (!id) {
        return;
      }
      if (!state.supabaseClient) {
        setMessage(message, "Connect Supabase to update consultation requests.", "error");
        return;
      }

      const confirmDialog = (title, body, confirmLabel) =>
        new Promise((resolve) => {
          const modal = document.getElementById("confirmModal");
          const titleEl = document.getElementById("confirmTitle");
          const bodyEl = document.getElementById("confirmMessage");
          const cancelBtn = document.getElementById("confirmCancel");
          const confirmBtn = document.getElementById("confirmConfirm");

          if (!modal || !titleEl || !bodyEl || !cancelBtn || !confirmBtn) {
            resolve(false);
            return;
          }

          titleEl.textContent = title;
          bodyEl.textContent = body;
          confirmBtn.textContent = confirmLabel || "Confirm";
          modal.classList.add("is-visible");
          modal.setAttribute("aria-hidden", "false");

          const cleanup = () => {
            modal.classList.remove("is-visible");
            modal.setAttribute("aria-hidden", "true");
            confirmBtn.removeEventListener("click", handleConfirm);
            cancelBtn.removeEventListener("click", handleCancel);
            modal.removeEventListener("click", handleBackdrop);
          };

          const handleConfirm = () => {
            cleanup();
            resolve(true);
          };

          const handleCancel = () => {
            cleanup();
            resolve(false);
          };

          const handleBackdrop = (clickEvent) => {
            if (clickEvent.target === modal) {
              handleCancel();
            }
          };

          confirmBtn.addEventListener("click", handleConfirm);
          cancelBtn.addEventListener("click", handleCancel);
          modal.addEventListener("click", handleBackdrop);
        });

      if (button.dataset.action === "delete") {
        const confirmed = await confirmDialog(
          "Delete consultation request?",
          "This action cannot be undone.",
          "Delete"
        );
        if (!confirmed) {
          return;
        }
        const { error } = await state.supabaseClient.from(CONSULT_TABLE).delete().eq("id", id);
        if (error) {
          setMessage(message, "Unable to delete consultation request.", "error");
          return;
        }
        load();
        return;
      }

      if (button.dataset.action === "reject") {
        const confirmed = await confirmDialog(
          "Reject consultation request?",
          "This will mark the request as rejected.",
          "Reject"
        );
        if (!confirmed) {
          return;
        }
        const { error } = await state.supabaseClient
          .from(CONSULT_TABLE)
          .update({ status: "rejected" })
          .eq("id", id);
        if (error) {
          setMessage(message, "Unable to reject consultation request.", "error");
          return;
        }
        load();
      }
    });
  }

  return { load };
};

