/*
 * dc.js: a small standalone runtime for pages exported from Claude Design
 * (.dc.html). It reads the page template from <template id="dc-template">,
 * renders it with Preact, and re-renders on setState, so the interactive
 * parts of the design work on a normal static host such as GitHub Pages.
 */
(function () {
  var h = preact.h;
  var HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  var WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    var q = path.match(/^(['"])(.*)\1$/);
    if (q) return q[2];
    var parts = path.split('.');
    var v = scope;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) {
      var v = lookup(p, scope);
      return v == null ? '' : String(v);
    });
  }

  function attrValue(raw, scope) {
    var m = raw.match(WHOLE);
    if (m) return lookup(m[1], scope);
    return raw.indexOf('{{') === -1 ? raw : interp(raw, scope);
  }

  function convertChildren(node, scope, out) {
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var r = convert(kids[i], scope);
      if (r == null) continue;
      if (Array.isArray(r)) for (var j = 0; j < r.length; j++) out.push(r[j]);
      else out.push(r);
    }
    return out;
  }

  function convert(node, scope) {
    if (node.nodeType === 3) {
      var t = node.nodeValue;
      return t.indexOf('{{') === -1 ? t : interp(t, scope);
    }
    if (node.nodeType !== 1) return null;
    var tag = node.localName;

    if (tag === 'sc-for') {
      var list = attrValue(node.getAttribute('list') || '', scope) || [];
      var as = node.getAttribute('as') || 'item';
      var res = [];
      for (var i = 0; i < list.length; i++) {
        var s = Object.create(scope);
        s[as] = list[i];
        s.$index = i;
        convertChildren(node.content || node, s, res);
      }
      return res;
    }
    if (tag === 'sc-if') {
      return attrValue(node.getAttribute('value') || '', scope)
        ? convertChildren(node, scope, [])
        : null;
    }

    var props = {};
    var attrs = node.attributes;
    for (var a = 0; a < attrs.length; a++) {
      var name = attrs[a].name;
      if (name.indexOf('hint-') === 0) continue;
      var val = attrValue(attrs[a].value, scope);
      if (val === undefined || val === null) continue;
      if (name.indexOf('on') === 0 && typeof val === 'function') {
        props[name] = val;
      } else {
        props[name] = val;
      }
    }
    var children = convertChildren(tag === 'template' ? node.content : node, scope, []);
    return h(tag, props, children);
  }

  function DCLogic(props) {
    this.props = props || {};
    this.state = {};
  }
  DCLogic.prototype.setState = function (patch, cb) {
    var next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
    this.state = Object.assign({}, this.state, next);
    this.__schedule(cb);
  };
  DCLogic.prototype.forceUpdate = function (cb) { this.__schedule(cb); };
  DCLogic.prototype.renderVals = function () { return {}; };
  DCLogic.prototype.__schedule = function (cb) {
    var self = this;
    if (cb) (self.__cbs = self.__cbs || []).push(cb);
    if (self.__pending) return;
    self.__pending = true;
    Promise.resolve().then(function () {
      self.__pending = false;
      self.__render();
      var cbs = self.__cbs || [];
      self.__cbs = [];
      cbs.forEach(function (f) { f(); });
    });
  };

  function mount(Component, defaults) {
    var tpl = document.getElementById('dc-template');
    var root = document.getElementById('dc-root');
    var props = Object.assign({}, defaults || {});
    var inst = new Component(props);
    inst.props = props;
    inst.state = inst.state || {};
    inst.__render = function () {
      var vals = inst.renderVals() || {};
      var vnodes = convertChildren(tpl.content, vals, []);
      preact.render(h(preact.Fragment, null, vnodes), root);
    };
    inst.__render();
    if (inst.componentDidMount) inst.componentDidMount();
    window.addEventListener('pagehide', function () {
      if (inst.componentWillUnmount) inst.componentWillUnmount();
    });
    return inst;
  }

  window.DCLogic = DCLogic;
  window.DC = { mount: mount };
})();
