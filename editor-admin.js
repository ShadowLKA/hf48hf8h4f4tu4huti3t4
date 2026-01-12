const TEAM_TABLE = "team_members";
const TEAM_BUCKET = "team-images";
const NEWS_TABLE = "news_slots";
const NEWS_BUCKET = "news-images";
const SERVICE_TABLE = "service_slots";
const SERVICE_BUCKET = "service-images";
const SUPABASE_STORAGE_KEY = "editorSupabaseConfig";
const DEFAULT_SUPABASE_URL = "https://heihssimnnilkowuxvfa.supabase.co";
const DEFAULT_SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlaWhzc2ltbm5pbGtvd3V4dmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2ODQxNzYsImV4cCI6MjA3OTI2MDE3Nn0.JGsfnHNVhnOIwfF_aJ_nCfRSkq8MF-QuoIyKQfzA5SY";

let connectSupabaseFn = null;
let loadConfigFn = null;

const getStoragePath = (publicUrl, bucket) => {
  if (!publicUrl) {
    return "";
  }
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = publicUrl.indexOf(marker);
  if (index === -1) {
    return "";
  }
  return publicUrl.slice(index + marker.length);
};

const setMessage = (el, text, type = "") => {
  if (!el) {
    return;
  }
  el.textContent = text;
  el.classList.toggle("is-visible", Boolean(text));
  el.classList.toggle("is-error", type === "error");
};

const setSupabaseStatus = (el, text, tone = "") => {
  if (!el) {
    return;
  }
  el.textContent = `Status: ${text}`;
  el.classList.remove("is-good", "is-bad");
  if (tone) {
    el.classList.add(tone);
  }
};

const setAdminEnabled = (sections, enabled) => {
  if (!sections?.length) {
    return;
  }
  sections.forEach((section) => {
    section.querySelectorAll("input, textarea, select, button").forEach((el) => {
      el.disabled = !enabled;
    });
  });
};

const safeFileName = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "-");
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export const applySupabaseDefaults = () => {
  const supabaseUrlInput = document.getElementById("supabaseUrlInput");
  const supabaseKeyInput = document.getElementById("supabaseKeyInput");
  if (loadConfigFn) {
    loadConfigFn();
  }
  if (supabaseUrlInput && !supabaseUrlInput.value.trim()) {
    supabaseUrlInput.value = DEFAULT_SUPABASE_URL;
  }
  if (supabaseKeyInput && !supabaseKeyInput.value.trim()) {
    supabaseKeyInput.value = DEFAULT_SUPABASE_KEY;
  }
};

export const autoConnectSupabase = () => {
  if (connectSupabaseFn) {
    connectSupabaseFn();
  }
};

export const initAdminTools = ({ state, refreshPreview }) => {
  const supabaseUrlInput = document.getElementById("supabaseUrlInput");
  const supabaseKeyInput = document.getElementById("supabaseKeyInput");
  const supabaseBadge = document.getElementById("supabaseBadge");
  const supabaseStatus = document.getElementById("supabaseStatus");
  const supabaseChip = document.getElementById("supabaseChip");
  const adminSections = Array.from(
    document.querySelectorAll(
      "[data-team-admin-section], [data-news-admin-section], [data-service-admin-section]"
    )
  );

  const teamForm = document.getElementById("teamAdminForm");
  const teamList = document.getElementById("teamAdminList");
  const teamMessage = document.getElementById("teamAdminMessage");
  const teamReset = document.getElementById("teamAdminReset");
  const confirmModal = document.getElementById("confirmModal");
  const confirmMessage = document.getElementById("confirmMessage");
  const confirmCancel = document.getElementById("confirmCancel");
  const confirmConfirm = document.getElementById("confirmConfirm");

  const newsBody = document.getElementById("newsAdminBody");
  const newsMessage = document.getElementById("newsAdminMessage");
  const slotEls = Array.from(document.querySelectorAll("[data-news-admin-slot]"));
  const serviceBody = document.getElementById("serviceAdminBody");
  const serviceMessage = document.getElementById("serviceAdminMessage");
  const serviceSlotEls = Array.from(
    document.querySelectorAll("[data-service-admin-slot]")
  );

  setAdminEnabled(adminSections, false);

  const loadSupabaseConfig = () => {
    const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.url && supabaseUrlInput) {
        supabaseUrlInput.value = parsed.url;
      }
      if (parsed.key && supabaseKeyInput) {
        supabaseKeyInput.value = parsed.key;
      }
    } catch (error) {
      return;
    }
  };

  const saveSupabaseConfig = (url, key) => {
    localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify({ url, key }));
  };

  const connectSupabase = () => {
    if (!window.supabase?.createClient) {
      setSupabaseStatus(supabaseStatus, "Supabase failed to load.", "is-bad");
      return;
    }
    const url = supabaseUrlInput.value.trim();
    const key = supabaseKeyInput.value.trim();
    if (!url || !key) {
      setSupabaseStatus(supabaseStatus, "Enter Supabase URL and anon key.", "is-bad");
      return;
    }
    saveSupabaseConfig(url, key);
    state.supabaseClient = window.supabase.createClient(url, key);
    supabaseBadge.textContent = "Supabase connected";
    supabaseBadge.classList.add("is-live");
    setSupabaseStatus(supabaseStatus, "Supabase ready.", "is-good");
    if (supabaseChip) {
      supabaseChip.textContent = "Online";
      supabaseChip.classList.add("is-live");
    }
    setAdminEnabled(adminSections, true);
    loadTeamMembers();
    loadNewsSlots();
    loadServiceSlots();
  };

  const resetTeamForm = () => {
    if (!teamForm) {
      return;
    }
    teamForm.reset();
    const idInput = teamForm.querySelector("input[name=\"id\"]");
    if (idInput) {
      idInput.value = "";
    }
    setMessage(teamMessage, "");
  };

  const renderTeamList = (members) => {
    if (!teamList) {
      return;
    }
    if (!members.length) {
      teamList.innerHTML = "<p class=\"tiny\">No entries yet.</p>";
      return;
    }
    teamList.innerHTML = members
      .map(
        (member) => `
          <div class="admin-list-item" data-id="${escapeHtml(member.id)}">
            <div>
              <strong>${escapeHtml(member.name || "")}</strong>
              <div>${escapeHtml(member.title || "")} - ${escapeHtml(member.role || "")}</div>
            </div>
            <div class="actions">
              <button class="btn ghost" type="button" data-team-edit>Edit</button>
              <button class="btn ghost" type="button" data-team-delete>Delete</button>
            </div>
          </div>`
      )
      .join("");
  };

  let teamMembers = [];
  let pendingDeleteId = "";

  const openConfirm = (member) => {
    if (!confirmModal) {
      return;
    }
    pendingDeleteId = member?.id || "";
    if (confirmMessage) {
      confirmMessage.textContent = `Delete ${member?.name || "this member"}? This action cannot be undone.`;
    }
    if (confirmConfirm) {
      confirmConfirm.textContent = "Delete";
    }
    confirmModal.classList.add("is-visible");
    confirmModal.setAttribute("aria-hidden", "false");
  };

  const closeConfirm = () => {
    if (!confirmModal) {
      return;
    }
    pendingDeleteId = "";
    confirmModal.classList.remove("is-visible");
    confirmModal.setAttribute("aria-hidden", "true");
  };

  const loadTeamMembers = async () => {
    if (!state.supabaseClient) {
      return;
    }
    const { data, error } = await state.supabaseClient
      .from(TEAM_TABLE)
      .select("id,name,title,role,bio,image_url,created_at")
      .order("created_at", { ascending: true });
    if (error) {
      setMessage(teamMessage, "Unable to load team members.", "error");
      return;
    }
    teamMembers = data || [];
    renderTeamList(teamMembers);
  };

  const uploadTeamImage = async (file) => {
    const safeName = safeFileName(file.name);
    const filePath = `team/${Date.now()}-${safeName}`;
    const { error } = await state.supabaseClient.storage
      .from(TEAM_BUCKET)
      .upload(filePath, file, { upsert: true });
    if (error) {
      throw error;
    }
    const { data } = state.supabaseClient.storage.from(TEAM_BUCKET).getPublicUrl(filePath);
    return data?.publicUrl || "";
  };

  if (teamForm) {
    teamForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!state.supabaseClient) {
        setMessage(teamMessage, "Connect Supabase first.", "error");
        return;
      }
      const formData = new FormData(teamForm);
      const id = formData.get("id");
      const name = String(formData.get("name") || "").trim();
      const title = String(formData.get("title") || "").trim();
      const role = String(formData.get("role") || "").trim();
      const bio = String(formData.get("bio") || "").trim();
      let imageUrl = String(formData.get("image_url") || "").trim();
      const imageFile = teamForm.querySelector("input[name=\"image\"]")?.files?.[0] || null;

      if (!name || !title || !role || !bio) {
        setMessage(teamMessage, "Please fill out all fields.", "error");
        return;
      }

      try {
        if (imageFile) {
          imageUrl = await uploadTeamImage(imageFile);
        }
        const payload = {
          name,
          title,
          role,
          bio,
          image_url: imageUrl || null
        };
        let response;
        if (id) {
          response = await state.supabaseClient.from(TEAM_TABLE).update(payload).eq("id", id);
        } else {
          response = await state.supabaseClient.from(TEAM_TABLE).insert(payload);
        }
        if (response.error) {
          setMessage(teamMessage, "Unable to save team member.", "error");
          return;
        }
        setMessage(teamMessage, "Saved.", "");
        resetTeamForm();
        loadTeamMembers();
        if (refreshPreview) {
          refreshPreview();
        }
      } catch (error) {
        const detail = error?.message || error?.error_description || error?.name || "";
        setMessage(teamMessage, `Image upload failed${detail ? `: ${detail}` : "."}`, "error");
      }
    });
  }

  if (teamReset) {
    teamReset.addEventListener("click", resetTeamForm);
  }

  if (teamList) {
    teamList.addEventListener("click", async (event) => {
      const editButton = event.target.closest("[data-team-edit]");
      const deleteButton = event.target.closest("[data-team-delete]");
      const item = event.target.closest("[data-id]");
      if (!item) {
        return;
      }
      const id = item.getAttribute("data-id");
      const member = teamMembers.find((entry) => String(entry.id) === id);
      if (!member) {
        return;
      }
      if (editButton && teamForm) {
        teamForm.querySelector("input[name=\"id\"]").value = member.id;
        teamForm.querySelector("input[name=\"name\"]").value = member.name;
        teamForm.querySelector("input[name=\"title\"]").value = member.title;
        teamForm.querySelector("input[name=\"role\"]").value = member.role;
        teamForm.querySelector("textarea[name=\"bio\"]").value = member.bio;
        teamForm.querySelector("input[name=\"image_url\"]").value = member.image_url || "";
        setMessage(teamMessage, "");
        return;
      }
      if (deleteButton) {
        openConfirm(member);
      }
    });
  }

  if (confirmCancel) {
    confirmCancel.addEventListener("click", closeConfirm);
  }

  if (confirmModal) {
    confirmModal.addEventListener("click", (event) => {
      if (event.target === confirmModal) {
        closeConfirm();
      }
    });
  }

  if (confirmConfirm) {
    confirmConfirm.addEventListener("click", async () => {
      if (!pendingDeleteId) {
        closeConfirm();
        return;
      }
      const member = teamMembers.find((entry) => entry.id === pendingDeleteId);
      if (!member) {
        closeConfirm();
        return;
      }
      if (member.image_url) {
        const imagePath = getStoragePath(member.image_url, TEAM_BUCKET);
        if (imagePath) {
          await state.supabaseClient.storage.from(TEAM_BUCKET).remove([imagePath]);
        }
      }
      const { error } = await state.supabaseClient.from(TEAM_TABLE).delete().eq("id", member.id);
      if (error) {
        setMessage(teamMessage, "Unable to delete team member.", "error");
        closeConfirm();
        return;
      }
      setMessage(teamMessage, "Deleted.", "");
      closeConfirm();
      loadTeamMembers();
      if (refreshPreview) {
        refreshPreview();
      }
    });
  }

  let slotData = {};
  let serviceSlotData = {};

  const updateSlotUi = (slotEl, data) => {
    const imageEl = slotEl.querySelector("[data-slot-image]");
    const placeholder = slotEl.querySelector("[data-slot-placeholder]");
    const captionInput = slotEl.querySelector("[data-slot-caption-input]");

    if (data?.image_url) {
      if (imageEl) {
        imageEl.src = data.image_url;
        imageEl.classList.remove("is-hidden");
      }
      if (placeholder) {
        placeholder.classList.add("is-hidden");
      }
    } else {
      if (imageEl) {
        imageEl.removeAttribute("src");
        imageEl.classList.add("is-hidden");
      }
      if (placeholder) {
        placeholder.classList.remove("is-hidden");
      }
    }

    if (captionInput) {
      captionInput.value = data?.caption || "";
    }
  };

  const loadNewsSlots = async () => {
    if (!state.supabaseClient) {
      return;
    }
    const { data, error } = await state.supabaseClient
      .from(NEWS_TABLE)
      .select("slot_number,caption,image_url,updated_at")
      .order("slot_number", { ascending: true });
    if (error) {
      setMessage(newsMessage, "Unable to load news slots.", "error");
      return;
    }
    slotData = (data || []).reduce((acc, item) => {
      acc[item.slot_number] = item;
      return acc;
    }, {});
    slotEls.forEach((slotEl) => {
      const slotNumber = Number(slotEl.dataset.slot);
      updateSlotUi(slotEl, slotData[slotNumber]);
    });
  };

  const uploadNewsImage = async (file, slotNumber) => {
    const safeName = safeFileName(file.name);
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
    const filePath = `news/slot-${slotNumber}.${ext}`;
    const { error } = await state.supabaseClient.storage
      .from(NEWS_BUCKET)
      .upload(filePath, file, { upsert: true });
    if (error) {
      throw error;
    }
    const { data } = state.supabaseClient.storage.from(NEWS_BUCKET).getPublicUrl(filePath);
    return data?.publicUrl || "";
  };

  const updateServiceSlotUi = (slotEl, data) => {
    const imageEl = slotEl.querySelector("[data-slot-image]");
    const placeholder = slotEl.querySelector("[data-slot-placeholder]");
    const captionInput = slotEl.querySelector("[data-slot-caption-input]");

    if (data?.image_url) {
      if (imageEl) {
        imageEl.src = data.image_url;
        imageEl.classList.remove("is-hidden");
      }
      if (placeholder) {
        placeholder.classList.add("is-hidden");
      }
    } else {
      if (imageEl) {
        imageEl.removeAttribute("src");
        imageEl.classList.add("is-hidden");
      }
      if (placeholder) {
        placeholder.classList.remove("is-hidden");
      }
    }

    if (captionInput) {
      captionInput.value = data?.caption || "";
    }
  };

  const loadServiceSlots = async () => {
    if (!state.supabaseClient) {
      return;
    }
    const { data, error } = await state.supabaseClient
      .from(SERVICE_TABLE)
      .select("service_key,slot_number,caption,image_url,updated_at")
      .order("service_key", { ascending: true })
      .order("slot_number", { ascending: true });
    if (error) {
      setMessage(serviceMessage, "Unable to load service slots.", "error");
      return;
    }
    serviceSlotData = (data || []).reduce((acc, item) => {
      const key = `${item.service_key}:${item.slot_number}`;
      acc[key] = item;
      return acc;
    }, {});
    serviceSlotEls.forEach((slotEl) => {
      const serviceKey = slotEl.dataset.serviceKey || "";
      const slotNumber = Number(slotEl.dataset.slot);
      const key = `${serviceKey}:${slotNumber}`;
      updateServiceSlotUi(slotEl, serviceSlotData[key]);
    });
  };

  const uploadServiceImage = async (file, serviceKey, slotNumber) => {
    const safeName = safeFileName(file.name);
    const ext = safeName.includes(".") ? safeName.split(".").pop() : "jpg";
    const filePath = `services/${serviceKey}-slot-${slotNumber}.${ext}`;
    const { error } = await state.supabaseClient.storage
      .from(SERVICE_BUCKET)
      .upload(filePath, file, { upsert: true });
    if (error) {
      throw error;
    }
    const { data } = state.supabaseClient.storage.from(SERVICE_BUCKET).getPublicUrl(filePath);
    return data?.publicUrl || "";
  };

  if (newsBody) {
    newsBody.addEventListener("click", async (event) => {
      const saveButton = event.target.closest("[data-slot-save]");
      const clearButton = event.target.closest("[data-slot-clear]");
      if (!saveButton && !clearButton) {
        return;
      }
      if (!state.supabaseClient) {
        setMessage(newsMessage, "Connect Supabase first.", "error");
        return;
      }
      const slotEl = event.target.closest("[data-slot]");
      if (!slotEl) {
        return;
      }
      const slotNumber = Number(slotEl.dataset.slot);
      const captionInput = slotEl.querySelector("[data-slot-caption-input]");
      const fileInput = slotEl.querySelector("[data-slot-file]");
      const caption = String(captionInput?.value || "").trim();
      const file = fileInput?.files?.[0] || null;

      try {
        if (clearButton) {
          const imageUrl = slotData[slotNumber]?.image_url || null;
          const imagePath = getStoragePath(imageUrl, NEWS_BUCKET);
          if (imagePath) {
            await state.supabaseClient.storage.from(NEWS_BUCKET).remove([imagePath]);
          }
          const { error } = await state.supabaseClient.from(NEWS_TABLE).upsert({
            slot_number: slotNumber,
            caption: null,
            image_url: null
          });
          if (error) {
            setMessage(newsMessage, "Unable to clear slot.", "error");
            return;
          }
          if (captionInput) {
            captionInput.value = "";
          }
          if (fileInput) {
            fileInput.value = "";
          }
          setMessage(newsMessage, "Cleared.", "");
          loadNewsSlots();
          if (refreshPreview) {
            refreshPreview();
          }
          return;
        }

        let imageUrl = slotData[slotNumber]?.image_url || null;
        if (file) {
          imageUrl = await uploadNewsImage(file, slotNumber);
        }
        const { error } = await state.supabaseClient.from(NEWS_TABLE).upsert({
          slot_number: slotNumber,
          caption: caption || null,
          image_url: imageUrl
        });
        if (error) {
          setMessage(newsMessage, "Unable to save slot.", "error");
          return;
        }
        setMessage(newsMessage, "Saved.", "");
        loadNewsSlots();
        if (refreshPreview) {
          refreshPreview();
        }
      } catch (error) {
        const detail = error?.message || error?.error_description || error?.name || "";
        setMessage(newsMessage, `Upload failed${detail ? `: ${detail}` : "."}`, "error");
      }
    });
  }

  if (serviceBody) {
    serviceBody.addEventListener("click", async (event) => {
      const saveButton = event.target.closest("[data-slot-save]");
      const clearButton = event.target.closest("[data-slot-clear]");
      if (!saveButton && !clearButton) {
        return;
      }
      if (!state.supabaseClient) {
        setMessage(serviceMessage, "Connect Supabase first.", "error");
        return;
      }
      const slotEl = event.target.closest("[data-slot]");
      if (!slotEl) {
        return;
      }
      const serviceKey = slotEl.dataset.serviceKey || "";
      const slotNumber = Number(slotEl.dataset.slot);
      const captionInput = slotEl.querySelector("[data-slot-caption-input]");
      const fileInput = slotEl.querySelector("[data-slot-file]");
      const caption = String(captionInput?.value || "").trim();
      const file = fileInput?.files?.[0] || null;
      const key = `${serviceKey}:${slotNumber}`;

      try {
        if (clearButton) {
          const imageUrl = serviceSlotData[key]?.image_url || null;
          const imagePath = getStoragePath(imageUrl, SERVICE_BUCKET);
          if (imagePath) {
            await state.supabaseClient.storage.from(SERVICE_BUCKET).remove([imagePath]);
          }
          const { error } = await state.supabaseClient.from(SERVICE_TABLE).upsert({
            service_key: serviceKey,
            slot_number: slotNumber,
            caption: null,
            image_url: null
          });
          if (error) {
            setMessage(serviceMessage, "Unable to clear slot.", "error");
            return;
          }
          if (captionInput) {
            captionInput.value = "";
          }
          if (fileInput) {
            fileInput.value = "";
          }
          setMessage(serviceMessage, "Cleared.", "");
          loadServiceSlots();
          if (refreshPreview) {
            refreshPreview();
          }
          return;
        }

        let imageUrl = serviceSlotData[key]?.image_url || null;
        if (file) {
          imageUrl = await uploadServiceImage(file, serviceKey, slotNumber);
        }
        const { error } = await state.supabaseClient.from(SERVICE_TABLE).upsert({
          service_key: serviceKey,
          slot_number: slotNumber,
          caption: caption || null,
          image_url: imageUrl
        });
        if (error) {
          setMessage(serviceMessage, "Unable to save slot.", "error");
          return;
        }
        setMessage(serviceMessage, "Saved.", "");
        loadServiceSlots();
        if (refreshPreview) {
          refreshPreview();
        }
      } catch (error) {
        const detail = error?.message || error?.error_description || error?.name || "";
        setMessage(serviceMessage, `Upload failed${detail ? `: ${detail}` : "."}`, "error");
      }
    });
  }

  
  connectSupabaseFn = connectSupabase;
  loadConfigFn = loadSupabaseConfig;
};


