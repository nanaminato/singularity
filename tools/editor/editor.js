"use strict";

const get = id => document.getElementById(id);
const selected = control => Array.from(control.selectedOptions, option => option.value);
let state, active, original, dirty = false, busy = false;
let readers = new Map();
const collection = () => get("collection").value;
const nodes = () => state.model.nodes.map(node => [node.id, node.title + " · " + node.id]);

function status(message, error = false) {
    get("status").textContent = message;
    get("status").classList.toggle("error", error);
}

function options(control, choices, value, multiple = false) {
    control.replaceChildren();
    for (const choice of choices) {
        const [key, title] = Array.isArray(choice) ? choice : [choice, choice];
        const option = new Option(title, key);
        option.selected = multiple ? (value || []).includes(key) : key === value;
        control.add(option);
    }
}

async function request(path, payload) {
    const config = payload === undefined ? {} : {
        method: "POST",
        headers: {"Content-Type": "application/json", "X-Editor-Token": state.token},
        body: JSON.stringify({revision: state.revision, ...payload})
    };
    const response = await fetch(path, config);
    const data = await response.json();
    if (!response.ok) throw Error(data.error || response.statusText);
    return data;
}

function canLeave() {
    return !busy && (!dirty || confirm("放弃尚未保存的修改？"));
}

function types() {
    return [...Object.keys(state.schema.types), ...Object.keys(state.model.types)].sort();
}

async function load(id) {
    state = await request("/api/model");
    get("project").textContent = state.model.project.name;
    const view = get("tree").value || state.model.views.find(v => v.kind === "composition")?.id || "";
    options(get("tree"), [["", "系统组成（全部节点）"], ...state.model.views.map(v => [v.id, v.title + " · " + v.kind])], view);
    options(get("edge-filter"), state.schema.relations, selected(get("edge-filter")), true);
    options(get("node-filter"), types(), selected(get("node-filter")), true);
    edit(state.model[collection()].find(item => item.id === id));
}

function showList() {
    const group = collection();
    get("tree-control").hidden = group !== "nodes";
    const records = new Map(state.model[group].map(item => [item.id, item]));
    const view = group === "nodes" && get("tree").value;
    const rows = group === "nodes" ? forestRows() : Array.from(records.keys(), id => ({id, depth: 0}));
    const search = get("search").value.trim().toLowerCase();
    get("items").replaceChildren();
    universe.render(group === "nodes", search);
    const matching = new Set(rows.filter(r => { const n = records.get(r.id); return [n.title,n.id,n.body].join(" ").toLowerCase().includes(search); }).map(r => r.id));
    if (search && group === "nodes") {
        const parents = new Map(rows.map(r => [r.id,r.parent]));
        for (const id of [...matching]) { let parent = parents.get(id); while(parent) { matching.add(parent); parent = parents.get(parent); } }
    }
    let hiddenDepth = null;
    for (const {id, depth} of rows) {
        if (!search && hiddenDepth !== null && depth > hiddenDepth) continue;
        hiddenDepth = view && collapsed.has(view + id) && !search ? depth : null;
        const item = records.get(id);
        const title = item.title || (group === "relations"
            ? [item.source, item.type, item.target].join(" → ") : item.target || item.id);
        if (!matching.has(id)) continue;
        const row = document.createElement("li");
        const button = document.createElement("button");
        button.textContent = title;
        row.style.marginLeft = Math.min(depth, 12) * 12 + "px";
        button.setAttribute("aria-current", String(active?.id === id));
        button.onclick = () => { if (canLeave()) { edit(item); universe.focus(id); } };
        row.append(button);
        if (view) decorateTree(row, id, title, depth, view);
        get("items").append(row);
    }
}

function field(container, key, title, value, config = {}, registry = readers) {
    const label = document.createElement("label");
    label.textContent = title;
    const control = document.createElement(config.choices ? "select" : config.long ? "textarea" : "input");
    control.required = Boolean(config.required);
    if (config.choices) {
        control.multiple = Boolean(config.multiple);
        if (control.multiple) control.size = Math.min(6, Math.max(2, config.choices.length));
        options(control, config.choices, config.kind === "boolean" && value !== undefined ? String(value) : value, control.multiple);
    } else {
        if (config.kind === "number") {
            control.type = "number";
            control.step = "any";
        }
        control.value = config.json && value !== undefined ? JSON.stringify(value, null, 2) : value ?? "";
    }
    control.readOnly = Boolean(config.readOnly);
    control.id = "field-" + container.id + "-" + key;
    label.htmlFor = control.id;
    container.append(label, control);
    registry.set(key, () => {
        if (control.multiple) return selected(control);
        if (control.value === "" && !config.required) return undefined;
        if (config.json) {
            try { return JSON.parse(control.value); }
            catch { throw Error(title + "需要有效的 JSON"); }
        }
        if (config.kind === "boolean") return control.value === "true";
        if (config.kind === "number") return control.valueAsNumber;
        return control.value;
    });
    return control;
}

function edit(item, creating = false) {
    childParent = null;
    original = item;
    if (item && collection() === "nodes") {
        const search = get("search").value.trim().toLowerCase();
        if (search && ![item.id,item.title,item.body].join(" ").toLowerCase().includes(search)) get("search").value = "";
        const parents = new Map(forestRows().map(row => [row.id,row.parent]));
        let parent = parents.get(item.id);
        while (parent) { collapsed.delete(get("tree").value + parent); parent = parents.get(parent); }
    }
    active = item || (creating ? {} : null);
    dirty = false;
    readers = new Map();
    const group = collection();
    const pane = get("fields");
    pane.replaceChildren();
    get("editor").hidden = !active;
    get("remove").hidden = !original;
    get("delete-confirmation").hidden = true;
    get("context").hidden = group !== "nodes" || !original;
    get("results").replaceChildren();
    get("heading").textContent = item?.title || item?.id || (creating ? "新建对象" : "请选择对象");
    showList();
    forestNavigation();
    const selectedRow = get("items").querySelector('button[aria-current="true"]');
    if (selectedRow) {
        const list = get("items");
        const rowRect = selectedRow.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        if (rowRect.top < listRect.top || rowRect.bottom > listRect.bottom)
            list.scrollTop += rowRect.top - listRect.top - list.clientHeight / 2;
    }
    if (!active) return;
    const add = (key, title, config = {}, fallback) =>
        field(pane, key, title, active[key] ?? fallback, config);
    const required = {required: true};
    const choice = choices => ({choices, required: true});
    add("id", "稳定 ID", {...required, readOnly: Boolean(original)});
    if (group === "nodes") {
        add("title", "名称", required);
        const type = add("type", "节点类型", choice(types()), "module");
        add("body", "正文（Markdown）", {...required, long: true});
        add("authorization", "授权状态", choice(state.schema.authorization), "not_applicable");
        add("delivery", "交付状态", choice(state.schema.delivery), "planned");
        add("verification", "验证状态", choice(state.schema.verification), "unverified");
        add("references", "关联文件引用", {multiple: true,
            choices: state.model.references.map(r => [r.id, r.target + " · " + r.id])});
        add("verification_basis", "验证证据", {multiple: true,
            choices: state.model.nodes.filter(n => n.type === "evidence").map(n => [n.id, n.title + " · " + n.id])});
        const attributes = document.createElement("fieldset");
        attributes.id = "attributes";
        pane.append(attributes);
        const drafts = new Map();
        let currentType = type.value;
        let attributeReaders = new Map();
        function showAttributes() {
            attributeReaders = new Map();
            attributes.replaceChildren();
            const legend = document.createElement("legend");
            legend.textContent = "类型字段";
            attributes.append(legend);
            const schema = state.model.types[type.value] ||
                {required: state.schema.types[type.value] || {}, optional: {}};
            const values = drafts.get(type.value) || (active.type === type.value ? active.attributes : {}) || {};
            for (const [key, kind] of Object.entries({...schema.required, ...schema.optional})) {
                const config = {kind, required: Object.hasOwn(schema.required, key)};
                if (kind === "array" || kind === "object") Object.assign(config, {json: true, long: true});
                if (kind === "boolean") config.choices = [...(config.required ? [] : [["", "未设置"]]), "true", "false"];
                const control = field(attributes, key, key + " (" + kind + ")", values[key], config, attributeReaders);
                control.addEventListener("input", () => {
                    try {
                        drafts.set(type.value, Object.fromEntries(Array.from(attributeReaders, ([name, read]) => [name, read()])));
                    } catch { /* Keep the visible invalid input until it can be corrected. */ }
                });
            }
            attributes.hidden = attributeReaders.size === 0;
        }
        type.onchange = () => {
            try { drafts.set(currentType, Object.fromEntries(Array.from(attributeReaders, ([name, read]) => [name, read()]))); }
            catch (error) { type.value = currentType; status(error.message, true); return; }
            currentType = type.value;
            showAttributes();
        };
        showAttributes();
        readers.set("attributes", () => Object.fromEntries(Array.from(attributeReaders, ([key, read]) => [key, read()])));
        add("basis", "人工决定依据（确认、拒绝、退役或更改受保护节点时填写）", {long: true});
    } else if (group === "relations") {
        add("type", "关系类型", choice(state.schema.relations));
        add("source", "起点", choice(nodes()));
        add("target", "终点", choice(nodes()));
        add("rationale", "关系依据", {long: true});
    } else if (group === "references") {
        add("kind", "引用类型", choice([["project_file", "项目内文件"], ["external_file", "外部文件"], ["url", "网址"]]));
        add("target", "路径或网址", required);
        add("purpose", "用途", required);
        add("tracking", "版本跟踪", choice([["live", "跟随当前文件"], ["pinned", "固定版本"]]));
        add("locator", "章节或符号");
        add("revision", "版本标识");
        add("digest", "SHA-256 摘要");
    } else {
        add("title", "视图名称", required);
        add("kind", "树类型", choice([["composition", "系统组成"], ["objectives", "目标能力"], ["delivery", "交付计划"]]));
        add("roots", "根节点", {...choice(nodes()), multiple: true});
    }
}

async function save(deleting = false) {
    if (busy) return;
    try {
        let operation;
        if (deleting) {
            operation = {action: "delete", collection: collection(), id: original.id};
        } else {
            const value = Object.fromEntries(Array.from(readers, ([key, read]) => [key, read()]));
            delete value.basis;
            if (collection() === "nodes") {
                value.actor = "Human";
                if (original?.authorization_basis) value.authorization_basis = original.authorization_basis;
            }
            operation = {action: "put", collection: collection(), value};
        }
        busy = true;
        get("editor").inert = true;
        get("collection").disabled = true;
        await request("/api/apply", {operations: childOperations(operation), basis: readers.get("basis")?.()});
        dirty = false;
        try {
            await load(operation.value?.id);
            status(deleting ? "已删除" : "已保存");
        } catch (error) {
            status("已写入，但重新读取失败：" + error.message, true);
        }
    } catch (error) {
        status(error.message, true);
    } finally {
        busy = false;
        get("editor").inert = false;
        get("collection").disabled = false;
    }
}

get("editor").onsubmit = event => { event.preventDefault(); save(); };
get("editor").oninput = () => { dirty = true; };
get("remove").onclick = () => {
    const id = original.id;
    const blockers = [];
    if (collection() === "nodes") {
        blockers.push(...state.model.relations
            .filter(edge => edge.source === id || edge.target === id).map(edge => edge.id));
        blockers.push(...state.model.views.filter(view => view.roots.includes(id)).map(view => view.id));
        blockers.push(...state.model.nodes.filter(node =>
            ["passed", "failed"].includes(node.verification) &&
            node.verification_basis?.includes(id)).map(node => node.id));
    } else if (collection() === "references") {
        blockers.push(...state.model.nodes.filter(node => node.references?.includes(id)).map(node => node.id));
    }
    const blocked = blockers.length > 0;
    get("delete-message").textContent = blocked
        ? "无法删除 " + id + "。请先解除依赖：" + blockers.join("、")
        : "确定删除 " + id + "？";
    get("delete-accept").hidden = blocked;
    get("delete-confirmation").hidden = false;
};
get("delete-cancel").onclick = () => { get("delete-confirmation").hidden = true; };
get("delete-accept").onclick = () => save(true);
get("create").onclick = () => { if (state && canLeave()) edit(undefined, true); };
get("reload").onclick = async () => {
    if (!canLeave()) return;
    try { await load(original?.id); status("已重新加载"); }
    catch (error) { status(error.message, true); }
};
let lastCollection = collection();
get("collection").onchange = () => {
    if (!state || !canLeave()) { get("collection").value = lastCollection; return; }
    lastCollection = collection();
    edit();
};
get("search").oninput = () => { if (state) showList(); };
get("tree").onchange = () => { if (state) { showList(); forestNavigation(); if (active) universe.focus(active.id); } };
window.addEventListener("beforeunload", event => {
    if (dirty) { event.preventDefault(); event.returnValue = ""; }
});
get("query").onsubmit = async event => {
    event.preventDefault();
    const start = original?.id;
    if (!start) return;
    try {
        const data = await request("/api/context", {id: start, depth: get("depth").valueAsNumber,
            relations: selected(get("edge-filter")), types: selected(get("node-filter"))});
        if (original?.id !== start || collection() !== "nodes") return;
        const summary = document.createElement("p");
        summary.textContent = "显示 " + data.matches.length + " 个节点，遍历 " + data.visited + " 个节点";
        const list = document.createElement("ul");
        for (const node of data.matches) {
            const row = document.createElement("li");
            const button = document.createElement("button");
            button.textContent = node.title + " · " + node.type + " · " + node.id;
            button.onclick = () => { if (canLeave()) edit(node); };
            row.append(button);
            list.append(row);
        }
        const paths = document.createElement("details");
        const heading = document.createElement("summary");
        heading.textContent = "遍历依据";
        const edges = document.createElement("ul");
        for (const reason of data.reasons) {
            const row = document.createElement("li");
            row.textContent = Object.values(reason).join(" · ");
            edges.append(row);
        }
        paths.append(heading, edges);
        get("results").replaceChildren(summary, list, paths);
    } catch (error) { status(error.message, true); }
};

load().catch(error => status(error.message, true));
