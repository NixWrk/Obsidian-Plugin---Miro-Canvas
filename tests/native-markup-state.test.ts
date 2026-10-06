import { describe, expect, it } from 'vitest';
import { CodeHeadingMarks, watchAttachmentLabel } from '../src/native-markup-state';
class Element {
    nodeType = 1;
    attributes = new Map<string, string>();
    classes = new Set<string>();
    children: Element[] = [];
    parentElement: Element | null = null;
    writes = 0;
    ownerDocument: unknown;
    classList = { contains: (name: string) => this.classes.has(name) };
    constructor(public tagName = 'DIV', classes = '') {
        for (const name of classes.split(' '))
            this.classes.add(name);
    }
    get nextElementSibling() {
        const siblings = this.parentElement?.children ?? [];
        return siblings[siblings.indexOf(this) + 1] ?? null;
    }
    get childElementCount() {
        return this.children.length;
    }
    append(child: Element) {
        child.remove();
        this.children.push(child);
        child.parentElement = this;
        return child;
    }
    remove() {
        if (this.parentElement)
            this.parentElement.children = this.parentElement.children.filter(child => child !== this);
        this.parentElement = null;
    }
    getAttribute(name: string) {
        return this.attributes.get(name) ?? null;
    }
    setAttribute(name: string, value: string) {
        this.writes++;
        this.attributes.set(name, value);
    }
    removeAttribute(name: string) {
        this.writes++;
        this.attributes.delete(name);
    }
    querySelector(selector: string) {
        return this.children.find(child => selector.includes('canvas-node-label') ? child.classes.has('canvas-node-label') : child.tagName === 'PRE') ?? null;
    }
    querySelectorAll(selector: string): Element[] {
        const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
        if (selector === '*')
            return all;
        return all.filter(child => {
            if (child.tagName !== 'P')
                return false;
            for (let parent = child.parentElement; parent; parent = parent.parentElement)
                if (parent.classes.has('markdown-preview-view'))
                    return true;
            return false;
        });
    }
}
const html = (element: Element) => element as unknown as HTMLElement;
describe('fallback attachment name state', () => {
    it('follows only direct label arrival/removal, avoids repeated writes and restores its original attribute', () => {
        let callback = () => {
        };
        let disconnected = false;
        let observed: unknown;
        class Observer {
            constructor(refresh: () => void) {
                callback = refresh;
            }
            observe(target: unknown, options: unknown) {
                observed = { target, options };
            }
            disconnect() {
                disconnected = true;
            }
        }
        const shell = new Element(), fallback = shell.append(new Element('SPAN'));
        shell.ownerDocument = { defaultView: { MutationObserver: Observer } };
        fallback.setAttribute('data-miro-native-label', 'prior');
        const watch = watchAttachmentLabel(html(shell), html(fallback));
        expect(observed).toEqual({ target: shell, options: { childList: true } });
        expect(fallback.getAttribute('data-miro-native-label')).toBe('false');
        const writes = fallback.writes;
        callback();
        expect(fallback.writes).toBe(writes);
        const nested = shell.append(new Element());
        nested.append(new Element('DIV', 'canvas-node-label'));
        callback();
        expect(fallback.getAttribute('data-miro-native-label')).toBe('false');
        const native = shell.append(new Element('DIV', 'canvas-node-label'));
        callback();
        expect(fallback.getAttribute('data-miro-native-label')).toBe('true');
        native.remove();
        callback();
        expect(fallback.getAttribute('data-miro-native-label')).toBe('false');
        watch.dispose();
        expect(disconnected).toBe(true);
        expect(fallback.getAttribute('data-miro-native-label')).toBe('prior');
        shell.append(native);
        callback();
        watch.refresh();
        expect(fallback.getAttribute('data-miro-native-label')).toBe('prior');
    });
    it('works without an observer and preserves a later external mark', () => {
        const shell = new Element(), label = shell.append(new Element('SPAN'));
        const watch = watchAttachmentLabel(html(shell), html(label));
        shell.append(new Element('DIV', 'canvas-node-label'));
        watch.refresh();
        expect(label.getAttribute('data-miro-native-label')).toBe('true');
        label.setAttribute('data-miro-native-label', 'external');
        watch.dispose();
        expect(label.getAttribute('data-miro-native-label')).toBe('external');
    });
});
describe('code heading state', () => {
    it('marks direct and wrapped headings, leaving an ordinary paragraph alone', () => {
        const root = new Element(), preview = root.append(new Element('DIV', 'markdown-preview-view'));
        const direct = preview.append(new Element('P'));
        preview.append(new Element('PRE'));
        const wrapper = preview.append(new Element('DIV', 'el-p')), wrapped = wrapper.append(new Element('P'));
        preview.append(new Element('DIV', 'el-pre')).append(new Element('PRE'));
        const ordinary = preview.append(new Element('P'));
        const marks = new CodeHeadingMarks(html(root));
        marks.refresh();
        for (const heading of [direct, wrapper, wrapped])
            expect(heading.getAttribute('data-miro-code-heading')).toBe('true');
        expect(ordinary.getAttribute('data-miro-code-heading')).toBeNull();
        const writes = [direct.writes, wrapper.writes, wrapped.writes];
        marks.refresh();
        expect([direct.writes, wrapper.writes, wrapped.writes]).toEqual(writes);
    });
    it('takes marks back after reorder/remount and restores previous values on cleanup', () => {
        const root = new Element(), preview = root.append(new Element('DIV', 'markdown-preview-view'));
        const first = preview.append(new Element('P')), pre = preview.append(new Element('PRE'));
        first.setAttribute('data-miro-code-heading', 'prior');
        const marks = new CodeHeadingMarks(html(root));
        marks.refresh();
        preview.append(first);
        marks.refresh();
        expect(first.getAttribute('data-miro-code-heading')).toBe('prior');
        preview.append(pre);
        marks.refresh();
        expect(first.getAttribute('data-miro-code-heading')).toBe('true');
        preview.remove();
        const replacement = root.append(new Element('DIV', 'markdown-preview-view'));
        const heading = replacement.append(new Element('P'));
        replacement.append(new Element('PRE'));
        marks.refresh();
        expect(first.getAttribute('data-miro-code-heading')).toBe('prior');
        expect(heading.getAttribute('data-miro-code-heading')).toBe('true');
        marks.dispose();
        expect(heading.getAttribute('data-miro-code-heading')).toBeNull();
        marks.refresh();
        expect(heading.getAttribute('data-miro-code-heading')).toBeNull();
    });
    it('keeps other wrapper content and later external marks', () => {
        const root = new Element(), preview = root.append(new Element('DIV', 'markdown-preview-view')), wrapper = preview.append(new Element('DIV', 'el-p'));
        const p = wrapper.append(new Element('P'));
        wrapper.append(new Element('BUTTON'));
        preview.append(new Element('DIV', 'el-pre')).append(new Element('PRE'));
        const marks = new CodeHeadingMarks(html(root));
        marks.refresh();
        expect(p.getAttribute('data-miro-code-heading')).toBe('true');
        expect(wrapper.getAttribute('data-miro-code-heading')).toBeNull();
        p.setAttribute('data-miro-code-heading', 'external');
        marks.dispose();
        expect(p.getAttribute('data-miro-code-heading')).toBe('external');
    });
});
