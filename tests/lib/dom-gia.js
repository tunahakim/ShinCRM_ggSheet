/** DOM giả tối thiểu cho ba tệp UI chạm document nhưng không cần trình duyệt thật. */

class GiaElement {
  constructor(tag, owner) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.ownerDocument = owner;
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this._text = '';
    this.clientHeight = 0;
    this.scrollHeight = 0;
    this.offsetWidth = 0;
    this.offsetHeight = 0;
    this.classList = {
      add: (...names) => {
        const values = this.className.split(/\s+/).filter(Boolean);
        names.forEach((name) => { if (values.indexOf(name) < 0) values.push(name); });
        this.className = values.join(' ');
      },
      remove: (...names) => {
        this.className = this.className.split(/\s+/).filter((name) => name && names.indexOf(name) < 0).join(' ');
      },
      toggle: (name, force) => {
        const has = this.className.split(/\s+/).indexOf(name) >= 0;
        const enabled = force === undefined ? !has : !!force;
        if (enabled) this.classList.add(name); else this.classList.remove(name);
        return enabled;
      },
      contains: (name) => this.className.split(/\s+/).indexOf(name) >= 0
    };
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) {
    this._text = String(value == null ? '' : value);
    this.children.slice().forEach((child) => this.removeChild(child));
  }
  get innerHTML() { return this.children.map((child) => child.outerHTML ? child.outerHTML() : '').join(''); }
  set innerHTML(value) {
    this.textContent = '';
    if (this.ownerDocument && typeof this.ownerDocument.parseHtml === 'function') {
      this.ownerDocument.parseHtml(String(value || '')).children.slice().forEach((child) => this.appendChild(child));
    }
  }
  get nextElementSibling() {
    if (!this.parentNode) return null;
    const at = this.parentNode.children.indexOf(this);
    return at < 0 ? null : this.parentNode.children[at + 1] || null;
  }
  get previousElementSibling() {
    if (!this.parentNode) return null;
    const at = this.parentNode.children.indexOf(this);
    return at <= 0 ? null : this.parentNode.children[at - 1] || null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.ownerDocument._byId[String(value)] = this;
    if (name === 'value') this.value = String(value);
    if (name === 'type') this.type = String(value);
    if (name === 'placeholder') this.placeholder = String(value);
    if (name === 'disabled') this.disabled = true;
    if (name === 'style') {
      String(value).split(';').forEach((part) => {
        const pair = part.split(':');
        if (pair.length < 2) return;
        const property = pair[0].trim();
        const propertyValue = pair.slice(1).join(':').trim();
        this.style[property] = propertyValue;
        if (property === 'max-width' && this.style.width === undefined) this.style.width = propertyValue;
      });
    }
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { if (child.parentNode) child.parentNode.removeChild(child); child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, before) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const at = this.children.indexOf(before);
    if (at < 0) this.children.push(child); else this.children.splice(at, 0, child);
    return child;
  }
  removeChild(child) {
    const at = this.children.indexOf(child);
    if (at >= 0) { this.children.splice(at, 1); child.parentNode = null; }
    return child;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() { this.focused = true; this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }
  getBoundingClientRect() { return this.rect || { left: 10, top: 20, bottom: 40, right: 110 }; }
  outerHTML() { return '<' + this.tagName.toLowerCase() + '>' + this.textContent + '</' + this.tagName.toLowerCase() + '>'; }
  matches(selector) {
    const id = /^#(.+)$/.exec(selector);
    if (id) return this.id === id[1];
    if (/^[a-z]+$/i.test(selector)) return this.tagName === selector.toUpperCase();
    if (selector === '[data-action]') return this.hasAttribute('data-action');
    if (selector === '[data-menu]') return this.hasAttribute('data-menu');
    if (selector === '[data-collapse]') return this.hasAttribute('data-collapse');
    if (selector === '[data-collapse-btn]') return this.hasAttribute('data-collapse-btn');
    const cls = /^\.([^\[]+)$/.exec(selector);
    if (cls) return this.className.split(/\s+/).indexOf(cls[1]) >= 0;
    const attribute = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(selector);
    return !!attribute && this.hasAttribute(attribute[1]) && (attribute[2] === undefined || this.getAttribute(attribute[1]) === attribute[2]);
  }
  closest(selector) {
    let node = this;
    const choices = selector.split(',').map((part) => part.trim());
    while (node) { if (choices.some((choice) => node.matches(choice))) return node; node = node.parentNode; }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const choices = selector.split(',').map((part) => part.trim());
    const found = [];
    const visit = (node) => {
      node.children.forEach((child) => { if (choices.some((choice) => child.matches(choice))) found.push(child); visit(child); });
    };
    visit(this);
    return found;
  }
}

class GiaDocument {
  constructor() {
    this._byId = {};
    this.body = this.createElement('body');
    this.listeners = {};
    this.activeElement = null;
  }
  createElement(tag) { return new GiaElement(tag, this); }
  createRange() { return { createContextualFragment: (html) => this.parseHtml(html) }; }
  parseHtml(html) {
    const fragment = new GiaElement('fragment', this);
    const stack = [fragment];
    const tokens = String(html || '').match(/<[^>]+>|[^<]+/g) || [];
    const voidTags = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
    tokens.forEach((token) => {
      if (token[0] !== '<') {
        stack[stack.length - 1]._text += token.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return;
      }
      if (/^<\//.test(token)) { if (stack.length > 1) stack.pop(); return; }
      const match = /^<([a-z0-9-]+)([^>]*)>/i.exec(token);
      if (!match) return;
      const node = this.createElement(match[1]);
      const attrs = match[2].replace(/\/$/, '');
      attrs.replace(/([a-z_:][-a-z0-9_:.]*)(?:=("[^"]*"|'[^']*'|[^\s]+))?/gi, (all, name, raw) => {
        const value = raw === undefined ? '' : String(raw).replace(/^['"]|['"]$/g, '');
        node.setAttribute(name, value);
        return all;
      });
      stack[stack.length - 1].appendChild(node);
      if (!voidTags.has(String(match[1]).toLowerCase()) && !/\/$/.test(token)) stack.push(node);
    });
    return fragment;
  }
  getElementById(id) { return this._byId[id] || null; }
  querySelector(selector) { return this.body.querySelector(selector); }
  querySelectorAll(selector) { return this.body.querySelectorAll(selector); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  addRoot(id) { const root = this.createElement('div'); root.id = id; this.body.appendChild(root); return root; }
}

function domGia() {
  const document = new GiaDocument();
  const root = document.addRoot('sidebar-root');
  return { document, root, window: { innerWidth: 300, innerHeight: 800 } };
}

module.exports = { GiaElement, GiaDocument, domGia };
