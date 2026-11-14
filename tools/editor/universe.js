"use strict";
const universe = (() => {
    const positions = new Map();
    let visible = false, query = "", zoom = 1, offset = {x: 0, y: 0};
    let gesture = null;
    let canvas, context;
    let layoutKey = "";
    function point(event) {
        const rect = canvas.getBoundingClientRect();
        return {x: event.clientX - rect.left, y: event.clientY - rect.top};
    }
    function world(p) {
        return {x: (p.x - offset.x) / zoom, y: (p.y - offset.y) / zoom};
    }
    function fit() {
        if (!canvas || !state.model.nodes.length) return;
        const points = state.model.nodes.map(n => positions.get(n.id));
        const xs = points.map(p => p.x), ys = points.map(p => p.y);
        const left = Math.min(...xs) - 120, right = Math.max(...xs) + 120;
        const top = Math.min(...ys) - 65, bottom = Math.max(...ys) + 65;
        zoom = Math.min(canvas.clientWidth / (right-left), canvas.clientHeight / (bottom-top), 1.5);
        offset = {x: canvas.clientWidth/2-(left+right)/2*zoom, y: canvas.clientHeight/2-(top+bottom)/2*zoom};
        draw();
    }
    function draw() {
        if (!visible || !canvas) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * ratio;
        canvas.height = canvas.clientHeight * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = "#f8fafc";
        context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        context.translate(offset.x, offset.y);
        context.scale(zoom, zoom);
        get("zoom-level").textContent = Math.round(zoom*100) + "%";
        context.strokeStyle = "#9baebe";
        context.lineWidth = 1 / zoom;
        const view = state.model.views.find(v => v.id === get("tree").value);
        const kind = treeKinds[view?.kind || "composition"];
        const extra = new Set(selected(get("visible-relations")));
        for (const edge of state.model.relations) {
            if (edge.type !== kind && !extra.has(edge.type)) continue;
            const a = positions.get(edge.source), b = positions.get(edge.target);
            if (!a || !b) continue;
            context.beginPath(); context.moveTo(a.x+90,a.y);
            if (edge.type === kind) {
                context.setLineDash([]);
                context.lineTo(a.x+120,a.y); context.lineTo(a.x+120,b.y); context.lineTo(b.x-90,b.y);
            } else {
                context.setLineDash([5,5]); context.lineTo(b.x,b.y);
            }
            context.stroke(); context.setLineDash([]);
        }
        for (const node of state.model.nodes) {
            const pos = positions.get(node.id);
            const match = !query || [node.id,node.title,node.body].join(" ").toLowerCase().includes(query);
            context.globalAlpha = match ? 1 : .22;
            context.fillStyle = active?.id === node.id ? "#c6e1fa" : "#e4edf5";
            context.shadowColor = context.fillStyle;
            context.shadowBlur = 0;
            context.fillRect(pos.x-90,pos.y-22,180,44);
            context.shadowBlur = 0;
            context.font = "13px system-ui"; context.textAlign = "center";
            context.fillStyle = "#142536";
            context.fillText(node.title.length > 13 ? node.title.slice(0,12)+"…" : node.title, pos.x,pos.y+5);
        }
        context.globalAlpha = 1;
    }
    function relationOptions() {
        const names = {contains:"组成",decomposes:"目标分解",plans:"交付计划",
            depends_on:"依赖",derived_from:"推导依据",constrains:"约束",implements:"实现",
            verifies:"验证",supports:"证据支持",conflicts_with:"冲突",supersedes:"替代",references:"一般关联"};
        const filter = get("visible-relations");
        const view = state.model.views.find(v => v.id === get("tree").value);
        const branch = treeKinds[view?.kind || "composition"];
        const panel = get("relation-options");
        panel.replaceChildren();
        for (const option of filter.options) {
            if (option.value === branch) { option.selected = false; continue; }
            const label = document.createElement("label");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = option.selected;
            checkbox.onchange = () => {
                option.selected = checkbox.checked;
                get("relation-count").textContent = selected(filter).length;
                draw();
            };
            const title = document.createElement("span");
            title.textContent = names[option.value] || option.value;
            const count = document.createElement("small");
            count.textContent = state.model.relations.filter(e=>e.type===option.value).length;
            label.append(checkbox,title,count);
            panel.append(label);
        }
        get("relation-count").textContent = selected(filter).length;
    }
    function init() {
        canvas = get("universe"); context = canvas.getContext("2d");
        get("fit-universe").onclick = fit;
        function zoomBy(factor) {
            const middle = {x:canvas.clientWidth/2,y:canvas.clientHeight/2};
            const before = world(middle);
            zoom = Math.min(4,Math.max(.1,zoom*factor));
            offset = {x:middle.x-before.x*zoom,y:middle.y-before.y*zoom};
            draw();
        }
        get("zoom-in").onclick = () => zoomBy(1.25);
        get("zoom-out").onclick = () => zoomBy(.8);
        document.addEventListener("pointerdown", event => {
            if (!get("relation-menu").contains(event.target)) get("relation-menu").open = false;
        });
        get("relation-menu").addEventListener("keydown", event => {
            if (event.key === "Escape") {
                get("relation-menu").open = false;
                get("relation-menu").querySelector("summary").focus();
            }
        });
        get("visible-relations").onchange = draw;
        get("hide-relations").onclick = () => { for (const option of get("visible-relations").options) option.selected = false; relationOptions(); draw(); };
        canvas.onpointerdown = event => {
            if (busy) return;
            const screen = point(event), pos = world(screen);
            const node = [...state.model.nodes].reverse().find(n => {
                const p = positions.get(n.id);
                return Math.abs(p.x-pos.x) <= 90 && Math.abs(p.y-pos.y) <= 22;
            });
            gesture = {start: screen, previous: screen, id: node?.id, moved: false};
            canvas.setPointerCapture(event.pointerId);
        };
        canvas.onpointermove = event => {
            if (!gesture) return;
            const current = point(event);
            if (Math.hypot(current.x-gesture.start.x,current.y-gesture.start.y) > 4) gesture.moved = true;
            const dx = current.x-gesture.previous.x, dy = current.y-gesture.previous.y;
            offset.x += dx; offset.y += dy;
            gesture.previous = current;
            draw();
        };
        canvas.onpointerup = () => {
            if (gesture?.id && !gesture.moved && canLeave()) {
                edit(state.model.nodes.find(n => n.id === gesture.id));
            }
            gesture = null;
        };
        canvas.onpointercancel = () => { gesture = null; };
        canvas.addEventListener("wheel", event => {
            event.preventDefault();
            const screen = point(event), before = world(screen);
            zoom = Math.min(4, Math.max(.1, zoom * Math.exp(-event.deltaY*.001)));
            offset = {x: screen.x-before.x*zoom, y: screen.y-before.y*zoom};
            draw();
        }, {passive:false});
        new ResizeObserver(draw).observe(canvas);
    }
    return {
        render(show, search) {
            visible = show; query = search;
            get("universe-panel").hidden = !show;
            document.querySelector("main").classList.toggle("universe-layout", show);
            if (!canvas) init();
            const filter = get("visible-relations");
            const chosen = selected(filter);
            options(filter, state.schema.relations, chosen, true);
            relationOptions();
            const rows = forestRows();
            const key = JSON.stringify(rows);
            if (key !== layoutKey) {
                layoutKey = key;
                positions.clear();
                const children = new Map();
                for (const row of rows) {
                    if (!children.has(row.parent)) children.set(row.parent, []);
                    children.get(row.parent).push(row);
                }
                let cursor = 0;
                // Postorder placement gives every branch its own vertical interval.
                for (const root of children.get(null) || []) {
                    const stack = [{row:root,done:false}];
                    while (stack.length) {
                        const entry = stack.pop(), descendants = children.get(entry.row.id) || [];
                        if (!entry.done && descendants.length) {
                            stack.push({row:entry.row,done:true});
                            for (const row of [...descendants].reverse()) stack.push({row,done:false});
                        } else {
                            const y = descendants.length
                                ? (positions.get(descendants[0].id).y + positions.get(descendants[descendants.length-1].id).y)/2
                                : cursor++ * 80;
                            positions.set(entry.row.id,{x:entry.row.depth*280,y});
                        }
                    }
                    cursor += 1.5;
                }
                if (show) fit();
            } else draw();
        },
        focus(id) {
            if (!visible || !positions.has(id)) return;
            const pos = positions.get(id);
            zoom = Math.max(zoom, 1);
            offset = {x:canvas.clientWidth/2-pos.x*zoom,y:canvas.clientHeight/2-pos.y*zoom};
            draw();
        }
    };
})();
