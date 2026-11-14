"use strict";
let childParent = null;
let dragged = null;
const collapsed = new Set();
const treeKinds = {composition: "contains", objectives: "decomposes", delivery: "plans"};

function relationId() {
    const used = new Set(["nodes", "relations", "references", "views"]
        .flatMap(key => state.model[key].map(item => item.id)));
    let index = 1;
    while (used.has("REL-TREE-" + index)) index++;
    return "REL-TREE-" + index;
}

function childOperations(operation) {
    if (!childParent || operation.action !== "put") return [operation];
    const view = state.model.views.find(view => view.id === childParent.view);
    collapsed.delete(view.id + childParent.id);
    return [operation, {action: "put", collection: "relations", value: {
        id: relationId(), type: treeKinds[view.kind], source: childParent.id, target: operation.value.id
    }}];
}

function decorateTree(row, id, title, depth, view) {
    row.dataset.nodeId = id;
    row.draggable = true;
    row.ondragstart = event => {
        if (busy || dirty) { event.preventDefault(); return; }
        dragged = id;
        event.dataTransfer.setData("text/plain", id);
    };
    row.ondragend = () => { dragged = null; };
    row.ondragover = event => {
        if (!dragged || dragged === id) return;
        event.preventDefault();
        const fraction = (event.clientY - row.getBoundingClientRect().top) / row.offsetHeight;
        row.dataset.drop = fraction < .25 ? "before" : fraction > .75 ? "after" : "inside";
    };
    row.ondragleave = () => { delete row.dataset.drop; };
    row.ondrop = event => {
        event.preventDefault();
        const mode = row.dataset.drop || "inside";
        delete row.dataset.drop;
        if (dragged) moveTree(dragged, id, mode);
        dragged = null;
    };
    const toggle = document.createElement("button");
    const currentView = state.model.views.find(v => v.id === view);
    const hasChildren = state.model.relations.some(e =>
        e.type === treeKinds[currentView?.kind || "composition"] && e.source === id);
    const closed = collapsed.has(view + id);
    toggle.className = "tree-toggle";
    toggle.textContent = "";
    toggle.setAttribute("aria-label", (closed ? "展开 " : "折叠 ") + title);
    toggle.setAttribute("aria-expanded", String(!closed));
    toggle.disabled = !hasChildren;
    toggle.title = hasChildren ? (closed ? "展开" : "折叠") : "叶节点";
    const labelButton = row.firstElementChild;
    labelButton.classList.add("tree-label");
    labelButton.title = title;
    const icon = document.createElement("span");
    icon.className = "folder-icon";
    icon.setAttribute("aria-hidden", "true");
    labelButton.prepend(icon);
    toggle.onclick = () => {
        if (collapsed.has(view + id)) collapsed.delete(view + id);
        else collapsed.add(view + id);
        showList();
    };
    const child = document.createElement("button");
    child.textContent = "+";
    child.className = "tree-add";
    child.title = "添加子节点";
    child.setAttribute("aria-label", "添加子节点到 " + title);
    child.onclick = () => {
        if (!canLeave()) return;
        edit(undefined, true);
        childParent = {id, view};
        get("heading").textContent = "添加子节点 · " + title;
    };
    row.prepend(toggle);
    row.append(child);
}

async function moveTree(source, target, mode) {
    if (busy || dirty || source === target) return;
    const view = state.model.views.find(v => v.id === get("tree").value);
    if (!view) return;
    const kind = treeKinds[view.kind];
    const edges = state.model.relations.filter(e => e.type === kind);
    const old = edges.find(e => e.target === source);
    const destination = edges.find(e => e.target === target);
    const parent = mode === "inside" ? target : destination?.source;
    const roots = view.roots.filter(id => id !== source);
    const remaining = edges.filter(e => e !== old);
    if (parent) {
        const edge = {...old, id: old?.id || relationId(), type: kind, source: parent, target: source};
        const index = mode === "inside" ? remaining.length : remaining.indexOf(destination) + (mode === "after" ? 1 : 0);
        remaining.splice(index, 0, edge);
    } else {
        const index = roots.indexOf(target);
        if (index < 0) { status("目标不在当前视图的根节点中", true); return; }
        roots.splice(index + (mode === "after" ? 1 : 0), 0, source);
    }
    const operations = edges.map(e => ({action: "delete", collection: "relations", id: e.id}));
    operations.push(...remaining.map(e => ({action: "put", collection: "relations", value: e})));
    operations.push({action: "put", collection: "views", value: {...view, roots}});
    busy = true;
    get("editor").inert = true;
    get("tree").disabled = get("collection").disabled = true;
    try {
        await request("/api/apply", {operations});
        collapsed.delete(view.id + parent);
        await load(source);
        status("已移动节点并保存树结构");
    } catch (error) {
        status(error.message, true);
    } finally {
        busy = false;
        get("editor").inert = false;
        get("tree").disabled = get("collection").disabled = false;
    }
}
function forestRows() {
    const view = state.model.views.find(v => v.id === get("tree").value);
    const kind = treeKinds[view?.kind || "composition"];
    const edges = state.model.relations.filter(e => e.type === kind);
    const parentIds = new Set(edges.map(e => e.target));
    const children = new Map();
    for (const edge of edges) {
        if (!children.has(edge.source)) children.set(edge.source, []);
        children.get(edge.source).push(edge.target);
    }
    const roots = state.model.nodes.filter(n => !parentIds.has(n.id)).map(n => n.id);
    const rows = [], stack = roots.reverse().map(id => ({id, parent:null, depth:0}));
    while (stack.length) {
        const row = stack.pop();
        rows.push(row);
        for (const id of [...(children.get(row.id) || [])].reverse())
            stack.push({id,parent:row.id,depth:row.depth+1});
    }
    return rows;
}

function forestNavigation() {
    const nav = get("forest-navigation");
    nav.replaceChildren();
    if (!active || collection() !== "nodes") return;
    const rows = forestRows(), map = new Map(rows.map(r => [r.id,r]));
    const records = new Map(state.model.nodes.map(n => [n.id,n]));
    const chain = [];
    let parent = map.get(active.id)?.parent;
    while (parent) { chain.unshift(parent); parent = map.get(parent)?.parent; }
    function add(id, prefix) {
        const button = document.createElement("button");
        button.textContent = prefix + records.get(id).title;
        button.onclick = () => { if (canLeave()) { edit(records.get(id)); universe.focus(id); } };
        nav.append(button);
    }
    for (const id of chain) add(id, "祖先 · ");
    for (const row of rows.filter(r => r.parent === active.id)) add(row.id, "子节点 · ");
}
