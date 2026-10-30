
/* ISS FIELD PDA - app.js */
/* No external libraries required */

(() => {
  "use strict";

  const KEY = "iss-field-pda-v1";
  const $ = id => document.getElementById(id);

  const money = n =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(n);

  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const today = () => {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0")
    ].join("-");
  };

  const month = () => today().slice(0, 7);

  const safe = value =>
    String(value ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);

  const fresh = () => ({
    version: 1,
    goal: 40000,
    accounts: [],
    sales: [],
    tasks: []
  });

  let db;

  try {
    db = {
      ...fresh(),
      ...JSON.parse(localStorage.getItem(KEY) || "{}")
    };
  } catch {
    db = fresh();
    alert(
      "Stored data could not be read. " +
      "An empty workspace was opened."
    );
  }

  function validDB(data) {
    return data &&
      Array.isArray(data.accounts) &&
      Array.isArray(data.sales) &&
      Array.isArray(data.tasks) &&
      Number.isFinite(Number(data.goal)) &&
      Number(data.goal) > 0;
  }

  if (!validDB(db)) {
    alert(
      "Existing stored data was invalid. " +
      "Restore a backup if available."
    );
    db = fresh();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
      return true;
    } catch {
      alert(
        "Unable to save. Check available storage " +
        "and export a backup."
      );
      return false;
    }
  }

  function commit(update) {
    const previous = structuredClone(db);
    update();

    if (!save()) {
      db = previous;
      return false;
    }

    render();
    return true;
  }

  function empty(message) {
    return `
      <div class="empty-state">
        <p>${safe(message)}</p>
      </div>
    `;
  }

  function setText(id, value) {
    $(id).textContent = value;
  }

  function actionButton(label, action, id) {
    return `
      <button
        type="button"
        data-action="${action}"
        data-id="${safe(id)}">
        ${safe(label)}
      </button>
    `;
  }

  function openDialog(id) {
    const dialog = $(id);
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(id) {
    $(id).close();
  }

  function currentSales() {
    return db.sales.filter(s =>
      s.date.slice(0, 7) === month()
    );
  }

  let editingAccount = null;
  let editingSale = null;
  let editingTask = null;

  // NAVIGATION

  function displayPage(id) {
    document.querySelectorAll(".page").forEach(page => {
      page.classList.toggle("active", page.id === id);
    });

    document.querySelectorAll("nav button").forEach(button => {
      const active = button.dataset.page === id;

      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    window.scrollTo(0, 0);
  }

  document.querySelectorAll("nav button").forEach(button => {
    button.addEventListener("click", () => {
      displayPage(button.dataset.page);
    });
  });

  // SALES DASHBOARD

  function dashboard() {
    const sales = currentSales();

    const total = sales.reduce(
      (sum, sale) => sum + sale.amount, 0
    );

    const commercial = sales
      .filter(s => s.type === "commercial")
      .reduce((sum, s) => sum + s.amount, 0);

    const retail = total - commercial;

    const costsKnown = sales.every(
      s => s.cost !== null && s.cost !== undefined
    );

    const profit = costsKnown
      ? sales.reduce(
          (sum, s) => sum + s.amount - s.cost, 0
        )
      : null;

    setText(
      "monthLabel",
      new Date().toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
      })
    );

    setText("totalSales", money(total));
    setText("commercialSales", money(commercial));
    setText("retailSales", money(retail));
    setText(
      "grossProfit",
      profit === null ? "Unknown" : money(profit)
    );
    setText("accountCount", String(db.accounts.length));

    const progress = total / db.goal * 100;

    $("goalBar").style.width =
      `${Math.min(100, Math.max(0, progress))}%`;

    setText(
      "goalText",
      `${money(total)} of ${money(db.goal)} ` +
      `(${Math.round(progress)}%)`
    );

    $("monthlyGoal").value = db.goal;
  }

  // CUSTOMER ACCOUNT LIST

  function accounts() {
    if (!db.accounts.length) {
      $("accountList").innerHTML = empty(
        "No accounts yet. Add your first commercial customer."
      );
      return;
    }

    $("accountList").innerHTML = db.accounts
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(account => {
        const monthlySales = db.sales
          .filter(s =>
            s.customerId === account.id &&
            s.date.startsWith(month())
          )
          .reduce((sum, s) => sum + s.amount, 0);

        return `
          <div class="list-item">
            <div class="list-item-title">
              ${safe(account.name)}
            </div>

            <div class="list-item-meta">
              ${safe(account.contact || "No contact")}
              ${account.phone
                ? " · " + safe(account.phone)
                : ""}
              <p>Monthly sales: ${money(monthlySales)}</p>
              ${account.notes
                ? "<p>" + safe(account.notes) + "</p>"
                : ""}
            </div>

            <div class="list-item-actions">
              ${actionButton("Edit", "edit-account", account.id)}
              ${actionButton("New Sale", "sale-for", account.id)}
              ${actionButton("Delete", "delete-account", account.id)}
            </div>
          </div>
        `;
      }).join("");
  }

  // SALES LEDGER

  function sales() {
    if (!db.sales.length) {
      $("salesList").innerHTML = empty(
        "No sales recorded. Add your first transaction."
      );
      return;
    }

    $("salesList").innerHTML = db.sales
      .slice()
      .sort((a, b) =>
        b.date.localeCompare(a.date) ||
        b.created.localeCompare(a.created)
      )
      .map(sale => {
        const account = db.accounts.find(
          a => a.id === sale.customerId
        );

        const customerName = account
          ? account.name
          : sale.type === "retail"
            ? "Retail Counter"
            : "Unassigned";

        const profit = sale.cost === null
          ? "Unknown"
          : money(sale.amount - sale.cost);

        return `
          <div class="list-item">
            <div class="list-item-title">
              ${money(sale.amount)}
              <span class="badge">
                ${safe(sale.type)}
              </span>
            </div>

            <div class="list-item-meta">
              ${safe(sale.date)}
              · ${safe(customerName)}
              <p>${safe(sale.notes || "No description")}</p>
              <p>Gross profit: ${profit}</p>
            </div>

            <div class="list-item-actions">
              ${actionButton("Edit", "edit-sale", sale.id)}
              ${actionButton("Delete", "delete-sale", sale.id)}
            </div>
          </div>
        `;
      }).join("");
  }

  // TASK LIST

  function tasks() {
    if (!db.tasks.length) {
      $("taskList").innerHTML = empty(
        "No follow-ups yet. Add a customer call or task."
      );
      return;
    }

    $("taskList").innerHTML = db.tasks
      .slice()
      .sort((a, b) =>
        Number(a.done) - Number(b.done) ||
        a.date.localeCompare(b.date)
      )
      .map(task => `
        <div class="list-item">
          <div class="list-item-title"
            style="${task.done
              ? "text-decoration:line-through;opacity:.65"
              : ""}">
            ${safe(task.title)}
          </div>

          <div class="list-item-meta">
            Due ${safe(task.date)}
            · ${task.done ? "Completed" : "Open"}
          </div>

          <div class="list-item-actions">
            ${actionButton(
              task.done ? "Reopen" : "Complete",
              "toggle-task",
              task.id
            )}
            ${actionButton("Edit", "edit-task", task.id)}
            ${actionButton("Delete", "delete-task", task.id)}
          </div>
        </div>
      `).join("");
  }

  // RENDER APPLICATION

  function render() {
    dashboard();
    accounts();
    sales();
    tasks();
  }

  // CUSTOMER SELECTOR

  function saleCustomers(selected = "") {
    const retail = $("saleType").value === "retail";

    $("saleCustomer").innerHTML = `
      <option value="">
        ${retail
          ? "Walk-in / No account"
          : "Select customer (optional)"}
      </option>
    ` + db.accounts.map(account => `
      <option value="${safe(account.id)}">
        ${safe(account.name)}
      </option>
    `).join("");

    $("saleCustomer").value = selected;
  }

  // OPEN SALE FORM

  function startSale(id = null, customerId = "") {
    editingSale = id;
    $("saleForm").reset();

    const sale = db.sales.find(s => s.id === id);

    $("saleType").value =
      sale?.type || "commercial";

    saleCustomers(sale?.customerId || customerId);

    $("saleAmount").value =
      sale ? String(sale.amount) : "";

    $("saleCost").value =
      sale?.cost == null ? "" : String(sale.cost);

    $("saleNotes").value = sale?.notes || "";

    $("saleDialog").querySelector("h2").textContent =
      sale ? "Edit Sale" : "Record Sale";

    openDialog("saleDialog");
  }

  // OPEN ACCOUNT FORM

  function startAccount(id = null) {
    editingAccount = id;
    $("accountForm").reset();

    const account = db.accounts.find(a => a.id === id);

    $("businessName").value = account?.name || "";
    $("contactName").value = account?.contact || "";
    $("phone").value = account?.phone || "";
    $("accountNotes").value = account?.notes || "";

    $("accountDialog").querySelector("h2").textContent =
      account ? "Edit Account" : "New Commercial Account";

    openDialog("accountDialog");
  }

  // OPEN TASK FORM

  function startTask(id = null) {
    editingTask = id;
    $("taskForm").reset();

    const task = db.tasks.find(t => t.id === id);

    $("taskTitle").value = task?.title || "";
    $("taskDate").value = task?.date || today();

    $("taskDialog").querySelector("h2").textContent =
      task ? "Edit Follow-Up" : "New Follow-Up";

    openDialog("taskDialog");
  }

  // MAIN ACTION BUTTONS

  $("quickSale").onclick = () => startSale();
  $("newSale").onclick = () => startSale();
  $("newAccount").onclick = () => startAccount();
  $("newTask").onclick = () => startTask();

  // CANCEL BUTTONS

  $("cancelSale").onclick = () =>
    closeDialog("saleDialog");

  $("cancelAccount").onclick = () =>
    closeDialog("accountDialog");

  $("cancelTask").onclick = () =>
    closeDialog("taskDialog");

  $("saleType").onchange = () =>
    saleCustomers($("saleCustomer").value);

  // SAVE CUSTOMER ACCOUNT

  $("accountForm").addEventListener("submit", event => {
    event.preventDefault();

    const name = $("businessName").value.trim();
    if (!name) return;

    const item = {
      id: editingAccount || uid(),
      name,
      contact: $("contactName").value.trim(),
      phone: $("phone").value.trim(),
      notes: $("accountNotes").value.trim()
    };

    const success = commit(() => {
      const index = db.accounts.findIndex(
        a => a.id === item.id
      );

      if (index >= 0) {
        db.accounts[index] = item;
      } else {
        db.accounts.push(item);
      }
    });

    if (success) closeDialog("accountDialog");
  });

  // SAVE SALE

  $("saleForm").addEventListener("submit", event => {
    event.preventDefault();

    const amount = Number($("saleAmount").value);
    const rawCost = $("saleCost").value;
    const cost = rawCost === ""
      ? null
      : Number(rawCost);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      (
        cost !== null &&
        (!Number.isFinite(cost) || cost < 0)
      )
    ) {
      alert("Enter a valid sale amount and cost.");
      return;
    }

    const previous = db.sales.find(
      s => s.id === editingSale
    );

    const item = {
      id: editingSale || uid(),
      date: previous?.date || today(),
      created:
        previous?.created || new Date().toISOString(),
      type: $("saleType").value,
      customerId: $("saleCustomer").value,
      amount: Math.round(amount * 100) / 100,
      cost: cost === null
        ? null
        : Math.round(cost * 100) / 100,
      notes: $("saleNotes").value.trim()
    };

    const success = commit(() => {
      const index = db.sales.findIndex(
        s => s.id === item.id
      );

      if (index >= 0) {
        db.sales[index] = item;
      } else {
        db.sales.push(item);
      }
    });

    if (success) closeDialog("saleDialog");
  });

  // SAVE FOLLOW-UP

  $("taskForm").addEventListener("submit", event => {
    event.preventDefault();

    const title = $("taskTitle").value.trim();
    const date = $("taskDate").value;

    if (!title || !date) return;

    const previous = db.tasks.find(
      t => t.id === editingTask
    );

    const item = {
      id: editingTask || uid(),
      title,
      date,
      done: previous?.done || false
    };

    const success = commit(() => {
      const index = db.tasks.findIndex(
        t => t.id === item.id
      );

      if (index >= 0) {
        db.tasks[index] = item;
      } else {
        db.tasks.push(item);
      }
    });

    if (success) closeDialog("taskDialog");
  });

  // EDIT, DELETE AND COMPLETE ACTIONS

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const id = button.dataset.id;

    switch (button.dataset.action) {
      case "edit-account":
        startAccount(id);
        break;

      case "sale-for":
        startSale(null, id);
        break;

      case "delete-account":
        if (db.sales.some(s => s.customerId === id)) {
          alert(
            "This account has linked sales. " +
            "Keep it to preserve sales history."
          );
          break;
        }

        if (confirm("Delete this customer account?")) {
          commit(() => {
            db.accounts = db.accounts.filter(
              a => a.id !== id
            );
          });
        }
        break;

      case "edit-sale":
        startSale(id);
        break;

      case "delete-sale":
        if (confirm("Delete this sale?")) {
          commit(() => {
            db.sales = db.sales.filter(
              s => s.id !== id
            );
          });
        }
        break;

      case "toggle-task":
        commit(() => {
          const task = db.tasks.find(t => t.id === id);
          if (task) task.done = !task.done;
        });
        break;

      case "edit-task":
        startTask(id);
        break;

      case "delete-task":
        if (confirm("Delete this follow-up?")) {
          commit(() => {
            db.tasks = db.tasks.filter(
              t => t.id !== id
            );
          });
        }
        break;
    }
  });

  // SAVE SETTINGS

  $("saveSettings").onclick = () => {
    const value = Number($("monthlyGoal").value);

    if (!Number.isFinite(value) || value <= 0) {
      alert("Enter a sales goal above zero.");
      return;
    }

    if (commit(() => { db.goal = value; })) {
      alert("Monthly goal saved.");
    }
  };

  // EXPORT BACKUP

  $("exportData").onclick = () => {
    try {
      const content = JSON.stringify({
        ...db,
        exportedAt: new Date().toISOString()
      }, null, 2);

      const blob = new Blob([content], {
        type: "application/json"
      });

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `ISS-PDA-Backup-${today()}.json`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      alert("Backup generation failed: " + error.message);
    }
  };

  // RESTORE BACKUP

  $("importData").onclick = () => {
    $("backupFile").click();
  };

  $("backupFile").onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());

      if (!validDB(data)) {
        throw new Error("Invalid backup structure.");
      }

      const confirmed = confirm(
        "Replace ALL current data with this backup? " +
        "Export your current data first."
      );

      if (!confirmed) return;

      const previous = db;
      db = { ...fresh(), ...data };

      if (!save()) {
        db = previous;
        return;
      }

      render();
      alert("Backup restored successfully.");
    } catch (error) {
      alert("Backup could not be restored: " + error.message);
    } finally {
      event.target.value = "";
    }
  };

  // CONNECTION INDICATOR

  window.addEventListener("online", () => {
    setText("connection", "LOCAL");
  });

  window.addEventListener("offline", () => {
    setText("connection", "OFFLINE");
  });

  setText(
    "connection",
    navigator.onLine ? "LOCAL" : "OFFLINE"
  );

  // APPLICATION STARTUP

  displayPage("dashboard");
  render();

})();
