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

  setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'id') this.ownerDocument._byId[String(value)] = this; }
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
  addEventListener(name, fn) { this.listeners[name] = fn; }
  focus() { this.focused = true; }
  getBoundingClientRect() { return this.rect || { left: 10, top: 20, bottom: 40, right: 110 }; }
  matches(selector) {
    if (selector === '[data-action]') return this.hasAttribute('data-action');
    if (selector === '[data-menu]') return this.hasAttribute('data-menu');
    if (selector === '[data-collapse]') return this.hasAttribute('data-collapse');
    if (selector === '[data-collapse-btn]') return this.hasAttribute('data-collapse-btn');
    const cls = /^\.([^\[]+)$/.exec(selector);
    if (cls) return this.className.split(/\s+/).indexOf(cls[1]) >= 0;
    const menu = /^\[data-menu="([^"]+)"\]$/.exec(selector);
    return !!menu && this.getAttribute('data-menu') === menu[1];
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
  }
  createElement(tag) { return new GiaElement(tag, this); }
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
