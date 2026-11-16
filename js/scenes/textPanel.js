import * as cg from "../render/core/cg.js";
import { G2 } from "../util/g2.js";

const NPANELS = 2;

let defaultPanels = () => ({
    docs: [
        { text: 'Left panel.\nLook at a panel in the headset to type into it.\n', cursor: 0, x: -.4, y: 1.5 },
        { text: 'Right panel.\n', cursor: 0, x: .4, y: 1.5 },
    ],
    editing: false,
});

window.kbdPanels = defaultPanels();
window.kbdFocus = { index: 0 };

let isValidDoc = d => d && typeof d.text == 'string' && typeof d.cursor == 'number'
    && typeof d.x == 'number' && typeof d.y == 'number';
let isValidPanels = p => p && Array.isArray(p.docs) && p.docs.length == NPANELS && p.docs.every(isValidDoc);
let isValidFocus = f => f && Number.isInteger(f.index) && f.index >= 0 && f.index < NPANELS;

export const init = async model => {


    const SIZE = 1024, PAD = 48, FONT_PX = 34, LINE_PX = 44, HEADER_PX = 70;
    const FONT = FONT_PX + 'px Menlo, Monaco, Consolas, monospace';
    const PANEL_SCALE = .35;
    const GAZE_DWELL = .3;

    let focusIndex = () => window.kbdFocus.index;
    let doc = () => window.kbdPanels.docs[focusIndex()];
    let share = () => server.broadcastGlobal('kbdPanels');
    let shareFocus = () => server.broadcastGlobal('kbdFocus');

    let measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = FONT;
    let charW = measureCtx.measureText('M').width;
    let cols = Math.floor((SIZE - 2 * PAD) / charW);
    let visibleRows = Math.floor((SIZE - HEADER_PX - PAD) / LINE_PX);

    let layout = text => {
        let rows = [], start = 0;
        for (let line of text.split('\n')) {
            let s = 0;
            while (line.length - s > cols) {
                let brk = line.lastIndexOf(' ', s + cols);
                let end = brk > s ? brk + 1 : s + cols;
                rows.push({ start: start + s, str: line.substring(s, end), maxCol: end - s - 1 });
                s = end;
            }
            rows.push({ start: start + s, str: line.substring(s), maxCol: line.length - s });
            start += line.length + 1;
        }
        return rows;
    }

    let rowOf = (rows, c) => {
        let r = 0;
        while (r + 1 < rows.length && rows[r + 1].start <= c)
            r++;
        return r;
    }

    let clampCursor = () => {
        let d = doc();
        d.cursor = Math.max(0, Math.min(d.text.length, d.cursor));
    }

    let insert = str => {
        let d = doc();
        d.text = d.text.substring(0, d.cursor) + str + d.text.substring(d.cursor);
        d.cursor += str.length;
    }

    let remove = (from, to) => {
        let d = doc();
        from = Math.max(0, from);
        to = Math.min(d.text.length, to);
        if (from < to) {
            d.text = d.text.substring(0, from) + d.text.substring(to);
            d.cursor = from;
        }
    }

    let moveVertically = dir => {
        let d = doc(), rows = layout(d.text);
        let r = rowOf(rows, d.cursor);
        let col = d.cursor - rows[r].start;
        let t = r + dir;
        if (t < 0) { d.cursor = 0; return; }
        if (t >= rows.length) { d.cursor = d.text.length; return; }
        d.cursor = rows[t].start + Math.min(col, rows[t].maxCol);
    }

    let handleKey = e => {
        let d = doc();
        switch (e.key) {
            case 'Enter': insert('\n'); break;
            case 'Tab': insert('  '); break;
            case 'Backspace': remove(d.cursor - 1, d.cursor); break;
            case 'Delete': remove(d.cursor, d.cursor + 1); break;
            case 'ArrowLeft': d.cursor--; break;
            case 'ArrowRight': d.cursor++; break;
            case 'ArrowUp': if (e.shiftKey) d.cursor = 0; else moveVertically(-1); break;
            case 'ArrowDown': if (e.shiftKey) d.cursor = d.text.length; else moveVertically(1); break;
            default:
                if (e.key.length != 1)
                    return false;
                insert(e.key);
        }
        clampCursor();
        return true;
    }

    let setFocus = index => {
        if (index != focusIndex()) {
            window.kbdFocus = { index: index };
            shareFocus();
        }
    }

    let isSpaceDown = false, isSpacePending = false;

    window.keydown = e => {
        if (e.metaKey || e.ctrlKey)
            return;
        e.preventDefault();

        if (e.key == ' ') {
            if (!e.repeat)
                isSpaceDown = isSpacePending = true;
            return;
        }
        let isChanged = false;
        if (isSpaceDown && isSpacePending) {
            isSpacePending = false;
            if (e.key == 'k')
                return;
            insert(' ');
            isChanged = true;
        }
        if (handleKey(e))
            isChanged = true;
        if (isChanged)
            share();
    }

    window.keyup = e => {
        if (e.key == ' ') {
            isSpaceDown = false;
            if (isSpacePending) {
                isSpacePending = false;
                insert(' ');
                clampCursor();
                share();
            }
        }
    }

    let isMouseDown = false, ex, ey;
    window.mousedown = e => {
        isMouseDown = true;
        ex = e.clientX;
        ey = e.clientY;
    }
    window.mouseup = e => isMouseDown = false;
    window.mousemove = e => {
        if (isMouseDown) {
            doc().x += .0015 * (e.clientX - ex);
            doc().y -= .0015 * (e.clientY - ey);
            ex = e.clientX;
            ey = e.clientY;
            share();
        }
    }

    let isInside = uvz => uvz && uvz.every(Number.isFinite)
        && Math.abs(uvz[0]) <= 1 && Math.abs(uvz[1]) <= 1;

    let gazeHit = () => {
        if (!window.vr || !window.views || !views[0])
            return null;
        let head = cg.mInverse(views[0].viewMatrix);
        let best = null;
        for (let i = 0; i < NPANELS; i++) {
            let uvz = cg.mHitRect(head, panels[i].getGlobalMatrix());
            if (isInside(uvz) && (best == null || uvz[2] < best.dist))
                best = { index: i, u: uvz[0], v: uvz[1], dist: uvz[2] };
        }
        return best;
    }

    let gaze = null, lookIndex = -1, lookStart = 0;

    let updateGaze = () => {
        gaze = gazeHit();
        let index = gaze ? gaze.index : -1;
        if (index != lookIndex) {
            lookIndex = index;
            lookStart = model.time;
        }
        if (index >= 0 && model.time - lookStart >= GAZE_DWELL)
            setFocus(index);
    }

    let renderPanel = (g2, i) => {
        let ctx = g2.getContext();
        let d = window.kbdPanels.docs[i];
        let isFocused = i == focusIndex();
        let isEditing = window.kbdPanels.editing;
        let rows = layout(d.text);
        let cr = rowOf(rows, d.cursor);
        let cc = d.cursor - rows[cr].start;

        if (cr < g2.scrollTop) g2.scrollTop = cr;
        if (cr >= g2.scrollTop + visibleRows) g2.scrollTop = cr - visibleRows + 1;
        g2.scrollTop = Math.max(0, Math.min(g2.scrollTop, rows.length - 1));

        let accent = isFocused ? (isEditing ? '#5ad1ff' : '#c8d2e4') : '#3a4458';
        ctx.fillStyle = isFocused ? 'rgba(16,20,32,0.90)' : 'rgba(16,20,32,0.65)';
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.lineWidth = isFocused ? 12 : 6;
        ctx.strokeStyle = accent;
        ctx.strokeRect(6, 6, SIZE - 12, SIZE - 12);

        ctx.font = '28px Helvetica, Arial, sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = accent;
        let status = !isFocused ? 'look here to focus'
            : isEditing ? 'focused — typing…'
                : 'focused — Space+k on the computer to type';
        ctx.fillText(status, PAD, HEADER_PX / 2 + 4);
        ctx.fillStyle = '#8090a8';
        let info = 'row ' + (cr + 1) + '/' + rows.length;
        ctx.fillText(info, SIZE - PAD - ctx.measureText(info).width, HEADER_PX / 2 + 4);

        ctx.font = FONT;
        ctx.textBaseline = 'top';
        ctx.fillStyle = isFocused ? '#e8ecf4' : '#8a93a6';
        for (let r = 0; r < visibleRows && g2.scrollTop + r < rows.length; r++)
            ctx.fillText(rows[g2.scrollTop + r].str, PAD, HEADER_PX + r * LINE_PX);

        if (isFocused && (model.time * 2 >> 0) % 2 == 0) {
            ctx.fillStyle = isEditing ? '#5ad1ff' : '#c8d2e4';
            ctx.fillRect(PAD + cc * charW - 1, HEADER_PX + (cr - g2.scrollTop) * LINE_PX - 2, 4, FONT_PX + 6);
        }

        if (gaze && gaze.index == i) {
            let gx = SIZE * (.5 + .5 * gaze.u), gy = SIZE * (.5 - .5 * gaze.v);
            let t = isFocused ? 1 : Math.min(1, (model.time - lookStart) / GAZE_DWELL);
            ctx.fillStyle = 'rgba(255,210,90,0.9)';
            ctx.beginPath();
            ctx.arc(gx, gy, 7, 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,210,90,0.9)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(gx, gy, 22, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * t);
            ctx.stroke();
        }
    }

    let g2s = [], panels = [];
    for (let i = 0; i < NPANELS; i++) {
        let g2 = new G2(false, SIZE);
        g2.scrollTop = 0;
        g2.render = () => renderPanel(g2, i);
        model.txtrSrc(3 + i, g2.getCanvas());
        g2s.push(g2);
        panels.push(model.add('square').txtr(3 + i));
    }

    let wasKeyboardMode = false;

    model.animate(() => {
        window.kbdPanels = server.synchronize('kbdPanels');
        window.kbdFocus = server.synchronize('kbdFocus');
        if (!isValidPanels(window.kbdPanels))
            window.kbdPanels = defaultPanels();
        if (!isValidFocus(window.kbdFocus))
            window.kbdFocus = { index: 0 };

        let isKeyboardMode = window.interactMode == 4;
        if (isKeyboardMode != wasKeyboardMode) {
            wasKeyboardMode = isKeyboardMode;
            window.kbdPanels.editing = isKeyboardMode;
            isSpaceDown = isSpacePending = false;
            share();
        }

        for (let i = 0; i < NPANELS; i++) {
            let d = window.kbdPanels.docs[i];
            panels[i].identity().move(d.x, d.y, 0).scale(PANEL_SCALE);
        }

        updateGaze();

        for (let g2 of g2s)
            g2.update();
    });
}
