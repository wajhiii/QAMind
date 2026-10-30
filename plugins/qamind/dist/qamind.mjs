#!/usr/bin/env node
import { createRequire as __qamindCreateRequire } from 'node:module';
const require = __qamindCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path19) {
      const ctrl = callVisitor(key, node, visitor, path19);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path19, ctrl);
        return visit_(key, ctrl, visitor, path19);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path19 = Object.freeze(path19.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path19);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path19 = Object.freeze(path19.concat(node));
          const ck = visit_("key", node.key, visitor, path19);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path19);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path19) {
      const ctrl = await callVisitor(key, node, visitor, path19);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path19, ctrl);
        return visitAsync_(key, ctrl, visitor, path19);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path19 = Object.freeze(path19.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path19);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path19 = Object.freeze(path19.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path19);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path19);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path19) {
      if (typeof visitor === "function")
        return visitor(key, node, path19);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path19);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path19);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path19);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path19);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path19);
      return void 0;
    }
    function replaceNode(key, path19, node) {
      const parent = path19[path19.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path19, value) {
      let v = value;
      for (let i = path19.length - 1; i >= 0; --i) {
        const k = path19[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path19) => path19 == null || typeof path19 === "object" && !!path19[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path19, value) {
        if (isEmptyPath(path19))
          this.add(value);
        else {
          const [key, ...rest] = path19;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path19) {
        const [key, ...rest] = path19;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path19, keepScalar) {
        const [key, ...rest] = path19;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path19) {
        const [key, ...rest] = path19;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path19, value) {
        const [key, ...rest] = path19;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str2) => str2.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str2, indent, comment) => str2.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str2.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str2) => /^(%|---|\.\.\.)/m.test(str2);
    function lineLengthOverLimit(str2, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str2.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str2[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str2 = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str2 += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str2 += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str2 += "\\0";
                    break;
                  case "0007":
                    str2 += "\\a";
                    break;
                  case "000b":
                    str2 += "\\v";
                    break;
                  case "001b":
                    str2 += "\\e";
                    break;
                  case "0085":
                    str2 += "\\N";
                    break;
                  case "00a0":
                    str2 += "\\_";
                    break;
                  case "2028":
                    str2 += "\\L";
                    break;
                  case "2029":
                    str2 += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str2 += "\\x" + code.substr(2);
                    else
                      str2 += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str2 += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str2 += "\n";
                  i += 2;
                }
                str2 += indent;
                if (json[i + 2] === " ")
                  str2 += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str2 = start ? str2 + json.slice(start) : json;
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str2 = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str2);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str2 : foldFlowLines.foldFlowLines(str2, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str2 = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str2;
      return identity.isScalar(node) || str2[0] === "{" || str2[0] === "[" ? `${props} ${str2}` : `${props}
${ctx.indent}${str2}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str2 = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str2.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str2 === "" ? "?" : explicitKey ? `? ${str2}` : str2;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str2 = `? ${str2}`;
        if (keyComment && !keyCommentDone) {
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str2;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
        str2 = `? ${str2}
${indent}:`;
      } else {
        str2 = `${str2}:`;
        if (keyComment)
          str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str2.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str2 += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str2 += stringifyComment.lineComment(str2, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str2;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str3 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str3 += stringifyComment.lineComment(str3, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str3);
      }
      let str2;
      if (lines.length === 0) {
        str2 = flowChars.start + flowChars.end;
      } else {
        str2 = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str2 += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str2 += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str2;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str2 = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str2.includes("\n"));
        if (i < items.length - 1) {
          str2 += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str2.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str2 += ",";
          }
        }
        if (comment)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment));
        lines.push(str2);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str2 = start;
          for (const line of lines)
            str2 += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str2}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str2) => str2,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str2) => new Scalar.Scalar(str2[0] === "t" || str2[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num2 = typeof value === "number" ? value : Number(value);
      if (!isFinite(num2))
        return isNaN(num2) ? ".nan" : num2 < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2),
      stringify(node) {
        const num2 = Number(node.value);
        return isFinite(num2) ? num2.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2));
        const dot = str2.indexOf(".");
        if (dot !== -1 && str2[str2.length - 1] === "0")
          node.minFractionDigits = str2.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str2, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str2) => str2,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str2) => str2 === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str2, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str2) : parseInt(str2, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str2) => parseFloat(str2),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str2, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str2)}`);
        return str2;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str2 = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str2.length);
          for (let i = 0; i < str2.length; ++i)
            buffer[i] = str2.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str2;
        if (typeof node_buffer.Buffer === "function") {
          str2 = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str2 = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str2.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str2.substr(o, lineWidth);
          }
          str2 = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str2 }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str2) => str2.slice(-3).toLowerCase() === "nan" ? NaN : str2[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str2) => parseFloat(str2.replace(/_/g, "")),
      stringify(node) {
        const num2 = Number(node.value);
        return isFinite(num2) ? num2.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str2) {
        const node = new Scalar.Scalar(parseFloat(str2.replace(/_/g, "")));
        const dot = str2.indexOf(".");
        if (dot !== -1) {
          const f = str2.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str2, offset, radix, { intAsBigInt }) {
      const sign = str2[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str2 = str2.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str2 = `0b${str2}`;
            break;
          case 8:
            str2 = `0o${str2}`;
            break;
          case 16:
            str2 = `0x${str2}`;
            break;
        }
        const n2 = BigInt(str2);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str2, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str2 = value.toString(radix);
        return value < 0 ? "-" + prefix + str2.substr(1) : prefix + str2;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str2, _onError, opt) => intResolve(str2, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str2, asBigInt) {
      const sign = str2[0];
      const parts = sign === "-" || sign === "+" ? str2.substring(1) : str2;
      const num2 = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num2(60) + num2(p), num2(0));
      return sign === "-" ? num2(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num2 = (n) => n;
      if (typeof value === "bigint")
        num2 = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num2(-1);
      }
      const _60 = num2(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str2, _onError, { intAsBigInt }) => parseSexagesimal(str2, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str2) => parseSexagesimal(str2, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str2) {
        const match = str2.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path19, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path19, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path19) {
        if (Collection.isEmptyPath(path19)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path19) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path19, keepScalar) {
        if (Collection.isEmptyPath(path19))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path19, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path19) {
        if (Collection.isEmptyPath(path19))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path19) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path19, value) {
        if (Collection.isEmptyPath(path19)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path19), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path19, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer2 = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer2}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep + cb;
              sep = "";
              break;
            }
            case "newline":
              if (comment)
                sep += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === "{";
      const fcName = isMap ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep === " ")
            sep = "\n";
          else if (!prevMoreIndented && sep === "\n")
            sep = "\n\n";
          value += sep + indent.slice(trimIndent) + content;
          sep = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep === "\n")
            value += "\n";
          else
            sep = "\n";
        } else {
          value += sep + content;
          sep = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep === "\n")
            res += sep;
          else
            sep = "\n";
        } else {
          res += sep + lm;
          sep = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts2 = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts2);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts2 = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts2);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep)
        for (const st of sep)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path19) => {
      let item = cst;
      for (const [field, index] of path19) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path19) => {
      const parent = visit.itemAtPath(cst, path19.slice(0, -1));
      const field = path19[path19.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path19, item, visitor) {
      let ctrl = visitor(item, path19);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path19.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path19);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path19) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else
            sep = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs15 = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs15, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs15);
              } else {
                Object.assign(it, { key: fs15, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs15 = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs15, sep: [] });
              else if (it.sep)
                this.stack.push(fs15);
              else
                Object.assign(it, { key: fs15, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// cli/src/main.ts
import fs14 from "node:fs";
import os3 from "node:os";
import path18 from "node:path";
import { parseArgs } from "node:util";

// core/lib/schema.ts
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
function typeMatches(value, type) {
  switch (type) {
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "string":
    case "boolean":
      return typeof value === type;
    case "array":
      return Array.isArray(value);
    case "object":
      return isObj(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}
function validateSchema(value, schema, at = "$", out = [], depth = 0) {
  if (!schema || depth > 8 || out.length >= 10) return out;
  if (Array.isArray(schema["allOf"])) for (const s of schema["allOf"]) validateSchema(value, s, at, out, depth + 1);
  for (const key of ["oneOf", "anyOf"]) {
    const options = schema[key];
    if (Array.isArray(options) && options.length > 0) {
      const ok = options.some((s) => validateSchema(value, s, at, [], depth + 1).length === 0);
      if (!ok) out.push(`${at}: does not match any of the ${key} alternatives`);
      return out;
    }
  }
  if (value === null && schema["nullable"] === true) return out;
  const type = schema["type"];
  const types = Array.isArray(type) ? type : typeof type === "string" ? [type] : [];
  if (types.length && !types.some((t) => typeMatches(value, t))) {
    out.push(`${at}: expected ${types.join("|")}, got ${typeOf(value)}`);
    return out;
  }
  if (Array.isArray(schema["enum"]) && !schema["enum"].includes(value)) out.push(`${at}: ${JSON.stringify(value)} is not one of the allowed values`);
  if (typeof value === "number") {
    if (typeof schema["minimum"] === "number" && value < schema["minimum"]) out.push(`${at}: ${value} is below the minimum ${schema["minimum"]}`);
    if (typeof schema["maximum"] === "number" && value > schema["maximum"]) out.push(`${at}: ${value} is above the maximum ${schema["maximum"]}`);
  }
  if (typeof value === "string") {
    if (typeof schema["minLength"] === "number" && value.length < schema["minLength"]) out.push(`${at}: shorter than minLength ${schema["minLength"]}`);
    if (typeof schema["maxLength"] === "number" && value.length > schema["maxLength"]) out.push(`${at}: longer than maxLength ${schema["maxLength"]}`);
  }
  if (isObj(value)) {
    const props = isObj(schema["properties"]) ? schema["properties"] : {};
    for (const req of Array.isArray(schema["required"]) ? schema["required"] : []) if (!(req in value)) out.push(`${at}.${req}: required property is missing`);
    for (const [k, sub] of Object.entries(props)) if (k in value) validateSchema(value[k], sub, `${at}.${k}`, out, depth + 1);
  }
  if (Array.isArray(value) && isObj(schema["items"])) {
    for (const [i, item] of value.slice(0, 5).entries()) validateSchema(item, schema["items"], `${at}[${i}]`, out, depth + 1);
  }
  return out;
}
function synthesize(schema, prefix, name = "", depth = 0) {
  if (!schema || depth > 6) return null;
  if ("example" in schema) return schema["example"];
  if ("default" in schema) return schema["default"];
  if (Array.isArray(schema["enum"]) && schema["enum"].length) return schema["enum"][0];
  if (Array.isArray(schema["allOf"])) {
    return Object.assign({}, ...schema["allOf"].map((s) => synthesize(s, prefix, name, depth + 1)));
  }
  for (const key of ["oneOf", "anyOf"]) {
    const o = schema[key];
    if (Array.isArray(o) && o.length) return synthesize(o[0], prefix, name, depth + 1);
  }
  const t = Array.isArray(schema["type"]) ? schema["type"].find((x) => x !== "null") : schema["type"];
  switch (t) {
    case "integer":
      return typeof schema["minimum"] === "number" ? Math.max(1, schema["minimum"]) : 1;
    case "number":
      return typeof schema["minimum"] === "number" ? schema["minimum"] : 1;
    case "boolean":
      return true;
    case "array": {
      const item = synthesize(schema["items"], prefix, name, depth + 1);
      return item === null ? [] : [item];
    }
    case "object":
    case void 0: {
      const props = isObj(schema["properties"]) ? schema["properties"] : {};
      if (t === void 0 && Object.keys(props).length === 0) return null;
      const required = new Set(Array.isArray(schema["required"]) ? schema["required"] : Object.keys(props));
      const out = {};
      for (const [k, sub] of Object.entries(props)) if (required.has(k)) out[k] = synthesize(sub, prefix, k, depth + 1);
      return out;
    }
    case "string": {
      const fmt = schema["format"];
      if (fmt === "email") return `${prefix.toLowerCase()}qa@example.test`.replace(/[^a-z0-9@._-]/g, "");
      if (fmt === "date-time") return "2030-01-01T00:00:00Z";
      if (fmt === "date") return "2030-01-01";
      if (fmt === "uuid") return "00000000-0000-4000-8000-000000000001";
      if (fmt === "uri" || fmt === "url") return "https://example.test/";
      const base = `${prefix}${name || "value"}`;
      const min = typeof schema["minLength"] === "number" ? schema["minLength"] : 0;
      return base.length >= min ? base : base.padEnd(min, "x");
    }
    default:
      return null;
  }
}

// core/lib/apiplan.ts
var STATUS_CLASS = /^[1-5]xx$/i;
function validatePlan(plan) {
  const errors = [];
  const p = plan;
  if (!p || typeof p !== "object" || !Array.isArray(p.probes)) return [`Not a plan file: expected { "probes": [...] }.`];
  const ids = /* @__PURE__ */ new Set();
  const strList2 = (v) => v === void 0 || typeof v === "string" || Array.isArray(v) && v.every((x) => typeof x === "string");
  for (const [i, raw] of p.probes.entries()) {
    const pr = raw;
    const at = `probes[${i}]${typeof pr?.["id"] === "string" ? ` (${pr["id"]})` : ""}`;
    if (!pr || typeof pr !== "object") {
      errors.push(`${at}: must be an object.`);
      continue;
    }
    if (typeof pr["id"] !== "string" || !pr["id"]) errors.push(`${at}: "id" is required (a short unique string).`);
    else if (ids.has(pr["id"])) errors.push(`${at}: duplicate id.`);
    else ids.add(pr["id"]);
    for (const k of ["method", "path", "role"]) if (typeof pr[k] !== "string" || !pr[k]) errors.push(`${at}: "${k}" is required (a string).`);
    if (typeof pr["title"] !== "string") errors.push(`${at}: "title" is required (a string).`);
    const rep = pr["repeat"];
    if (rep !== void 0 && !(Number.isInteger(rep?.count) && rep?.count >= 1 && rep?.count <= 20)) errors.push(`${at}: repeat.count must be a whole number from 1 to 20.`);
    const exp = pr["expect"];
    if (exp !== void 0) {
      const st = exp["status"];
      const okStatus = (v) => typeof v === "number" && Number.isInteger(v) || typeof v === "string" && (STATUS_CLASS.test(v) || /^\d{3}$/.test(v));
      if (st !== void 0 && !(okStatus(st) || Array.isArray(st) && st.length > 0 && st.every(okStatus))) errors.push(`${at}: expect.status must be a number, "4xx"-style class, or a list of those.`);
      for (const k of ["body_contains", "body_not_contains"]) if (!strList2(exp[k])) errors.push(`${at}: expect.${k} must be a string or a list of strings.`);
      if (exp["json"] !== void 0 && !(Array.isArray(exp["json"]) && exp["json"].every((c) => c && typeof c.path === "string"))) errors.push(`${at}: expect.json must be a list of { "path": "$.x", ... } checks.`);
    }
    if (pr["capture"] !== void 0 && (typeof pr["capture"] !== "object" || Array.isArray(pr["capture"]))) errors.push(`${at}: capture must be an object like { "var": "$.json.path" }.`);
  }
  return errors.slice(0, 15);
}
var SIDE_EFFECT = /(forgot|reset|invite|e-?mail|mail|sms|otp|notify|notification|payment|pay\b|charge|checkout|refund|billing|webhook|send)/i;
var CREDENTIAL_FIELD = /pass(word)?|secret|token|otp|\bpin\b/i;
var isObj2 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function bodyTargets(props, prefix) {
  const out = [];
  for (const [field, sub] of Object.entries(props)) {
    out.push({ label: field, schema: sub, set: (b, v) => ({ ...b, [field]: v }) });
    const items = isObj2(sub["items"]) ? sub["items"] : void 0;
    const itemProps = items && isObj2(items["properties"]) ? items["properties"] : void 0;
    if (sub["type"] === "array" && items && itemProps) {
      for (const [k, s2] of Object.entries(itemProps)) {
        out.push({
          label: `${field}[0].${k}`,
          schema: s2,
          set: (b, v) => {
            const arr = Array.isArray(b[field]) && b[field].length > 0 ? [...b[field]] : [synthesize(items, prefix)];
            arr[0] = { ...isObj2(arr[0]) ? arr[0] : {}, [k]: v };
            return { ...b, [field]: arr };
          }
        });
      }
    }
  }
  return out;
}
var singular = (word) => word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
var lastSegment = (p) => (p.split("/").filter((x) => x && !x.startsWith("{")).pop() ?? "").toLowerCase();
var idVar = (resource) => `${singular(resource.replace(/[^a-z0-9]/gi, ""))}Id`;
var REF_FIELD = /^(.+?)(?:_id|Id)$/;
var SPECIAL_STRINGS = ["(", "'", '"', "%", "\\", "<b>x</b>", "\u{1F600}", "x".repeat(3e3)];
var PAGE_NAME = /^(page|offset|skip)$/i;
var SIZE_NAME = /^(page_?size|limit|per_?page|size|take)$/i;
var notFoundValue = (p) => {
  const s = p.schema ?? {};
  if (s["format"] === "uuid") return "00000000-0000-4000-8000-00000000dead";
  if (s["type"] === "integer" || s["type"] === "number") return 999999999;
  return "qa-does-not-exist";
};
function fillPath(ep, mode, own = false) {
  const needs = [];
  const path19 = ep.path.replace(/\{([^}]+)\}/g, (match, name, offset) => {
    const param = ep.parameters.find((p) => p.in === "path" && p.name === name) ?? { name, in: "path", required: true };
    if (mode === "not-found") return encodeURIComponent(String(notFoundValue(param)));
    const resource = lastSegment(ep.path.slice(0, offset));
    const plain = name.toLowerCase() === "id" && resource ? idVar(resource) : name;
    const variable = own ? `${plain}Own` : plain;
    needs.push(variable);
    return `{{${variable}}}`;
  });
  return { path: path19, needs };
}
function withReferences(value, vars) {
  if (Array.isArray(value)) return value.map((v) => withReferences(v, vars));
  if (isObj2(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        const m = REF_FIELD.exec(k);
        if (m && typeof v === "string") {
          const name = idVar(m[1]);
          vars.add(name);
          return [k, `{{${name}}}`];
        }
        return [k, withReferences(v, vars)];
      })
    );
  }
  return value;
}
function wrongTypeValue(schema) {
  switch (schema["type"]) {
    case "integer":
    case "number":
      return "not-a-number";
    case "boolean":
      return "yes";
    case "array":
      return "not-an-array";
    case "object":
      return "not-an-object";
    default:
      return 12345;
  }
}
function generatePlan(inv, opts2) {
  const probes = [];
  const excluded = [];
  const wantedVars = /* @__PURE__ */ new Set();
  let seq = 0;
  const add = (p) => {
    const probe = { id: `P${String(++seq).padStart(3, "0")}`, ...p };
    probes.push(probe);
    return probe;
  };
  for (const ep of inv.endpoints) {
    if (ep.method === "DELETE" || ep.method === "HEAD" || ep.method === "OPTIONS") continue;
    if (!opts2.sideEffects && SIDE_EFFECT.test(`${ep.path} ${ep.operation_id ?? ""}`)) {
      excluded.push(ep.operation);
      continue;
    }
    const isRead = ep.method === "GET";
    if (!isRead && !opts2.writes) continue;
    const startCount = probes.length;
    const room = () => probes.length - startCount < opts2.maxPerEndpoint;
    const base = fillPath(ep, "placeholder", !isRead);
    const op = ep.operation;
    const baseBody = ep.request_body?.schema ? withReferences(synthesize(ep.request_body.schema, opts2.prefix), wantedVars) : void 0;
    for (const v of base.needs) wantedVars.add(v);
    const common = { operation: op, method: ep.method, role: opts2.role, ...base.needs.length ? { needs: base.needs } : {} };
    if (ep.auth === "required" && room()) {
      add({
        title: `${op} without credentials is refused`,
        operation: op,
        method: ep.method,
        path: base.path,
        ...baseBody !== void 0 ? { body: baseBody } : {},
        role: "anonymous",
        expect: { status: [401, 403] },
        tags: ["auth", "anonymous"],
        ...base.needs.length ? { needs: base.needs } : {}
      });
    }
    if (isRead && base.needs.length === 0 && ep.parameters.every((p) => !p.required || p.in === "path") && room()) {
      add({ ...common, title: `${op} returns the documented success response`, path: base.path, expect: { status: "2xx" }, tags: ["happy"] });
    }
    if (base.needs.length > 0 && isRead && room()) {
      const nf = fillPath(ep, "not-found");
      add({ operation: op, method: ep.method, path: nf.path, role: opts2.role, title: `${op} for an id that does not exist`, expect: { status: "4xx" }, tags: ["not-found"] });
    }
    for (const p of ep.parameters.filter((x) => x.in === "query")) {
      const s = p.schema ?? {};
      const values = [];
      if (PAGE_NAME.test(p.name)) values.push(0, -1, 999999999, "abc");
      else if (SIZE_NAME.test(p.name)) values.push(0, -1, typeof s["maximum"] === "number" ? s["maximum"] + 1 : 1000001, "abc");
      else if (s["type"] === "integer" || s["type"] === "number") {
        if (typeof s["minimum"] === "number") values.push(s["minimum"] - 1);
        if (typeof s["maximum"] === "number") values.push(s["maximum"] + 1);
        values.push("abc");
      } else if (Array.isArray(s["enum"])) values.push("__not_a_valid_value__");
      else if (s["type"] === "string" || s["type"] === void 0) {
        values.push(...SPECIAL_STRINGS);
        if (typeof s["maxLength"] === "number") values.push("x".repeat(s["maxLength"] + 1));
      }
      for (const v of values) {
        if (!room() || base.needs.length) break;
        const shown = typeof v === "string" && v.length > 24 ? `${v.slice(0, 12)}\u2026 (${v.length} chars)` : String(v);
        add({ ...common, title: `${op} with ${p.name}=${shown}`, path: base.path, query: { [p.name]: v }, tags: ["query-edge", p.name] });
      }
    }
    if (!isRead && ep.request_body?.schema && baseBody && typeof baseBody === "object" && !Array.isArray(baseBody)) {
      const schema = ep.request_body.schema;
      const props = schema["properties"] ?? {};
      const required = Array.isArray(schema["required"]) ? schema["required"] : [];
      const body = baseBody;
      const bodyCommon = { ...common, path: base.path };
      const hasCredentials = Object.keys(props).some((k) => CREDENTIAL_FIELD.test(k));
      const targets = bodyTargets(props, opts2.prefix);
      if (ep.method === "POST" && !hasCredentials && room()) {
        add({ ...bodyCommon, title: `${op} with a valid body succeeds`, body, expect: { status: "2xx" }, tags: ["happy", "write"] });
      }
      for (const field of required.slice(0, 4)) {
        if (!room()) break;
        const { [field]: _omit, ...rest } = body;
        add({ ...bodyCommon, title: `${op} without required field "${field}"`, body: rest, expect: { status: "4xx" }, tags: ["validation", "write"] });
      }
      for (const t of targets.slice(0, 8)) {
        if (!room()) break;
        add({ ...bodyCommon, title: `${op} with wrong type for "${t.label}"`, body: t.set(body, wrongTypeValue(t.schema)), expect: { status: "4xx" }, tags: ["validation", "write"] });
      }
      for (const t of targets) {
        const sub = t.schema;
        const type = sub["type"];
        if (type === "integer" || type === "number") {
          const min = typeof sub["minimum"] === "number" ? sub["minimum"] : void 0;
          const max = typeof sub["maximum"] === "number" ? sub["maximum"] : void 0;
          const tries = [min !== void 0 ? min - 1 : -1];
          if (max !== void 0) tries.push(max + 1);
          else tries.push(0, 2147483648);
          if (type === "integer") tries.push(1.5);
          for (const v of tries) {
            if (!room()) break;
            const outOfRange = typeof v === "number" && (min !== void 0 && v < min || max !== void 0 && v > max || type === "integer" && !Number.isInteger(v));
            add({ ...bodyCommon, title: `${op} with ${t.label}=${String(v)}`, body: t.set(body, v), ...outOfRange ? { expect: { status: "4xx" } } : {}, tags: ["boundary", "write"] });
          }
        } else if (type === "string" && typeof sub["maxLength"] === "number" && room()) {
          add({ ...bodyCommon, title: `${op} with "${t.label}" longer than maxLength`, body: t.set(body, "x".repeat(sub["maxLength"] + 1)), expect: { status: "4xx" }, tags: ["boundary", "write"] });
        } else if (Array.isArray(sub["enum"]) && room()) {
          add({ ...bodyCommon, title: `${op} with "${t.label}" outside the allowed values`, body: t.set(body, "__not_allowed__"), expect: { status: "4xx" }, tags: ["validation", "write"] });
        } else if (type === "array" && !t.label.includes("[") && room()) {
          add({ ...bodyCommon, title: `${op} with empty "${t.label}"`, body: t.set(body, []), ...typeof sub["minItems"] === "number" && sub["minItems"] > 0 ? { expect: { status: "4xx" } } : {}, tags: ["boundary", "write"] });
        }
      }
      if (room()) add({ ...bodyCommon, title: `${op} with an empty JSON object`, body: {}, ...required.length ? { expect: { status: "4xx" } } : {}, tags: ["validation", "write"] });
      if (room()) add({ ...bodyCommon, title: `${op} with malformed JSON`, raw_body: '{"broken":', expect: { status: "4xx" }, tags: ["validation", "leakage", "write"] });
      if (ep.method === "POST" && !hasCredentials && room()) {
        add({ ...bodyCommon, title: `${op} sent twice at once (duplicate submission)`, body, repeat: { count: 2, parallel: true }, tags: ["concurrency", "write"] });
      }
    }
  }
  for (const ep of opts2.matrix === false ? [] : inv.endpoints) {
    if (!opts2.sideEffects && SIDE_EFFECT.test(`${ep.path} ${ep.operation_id ?? ""}`)) continue;
    if (ep.method !== "GET" || ep.path.includes("{") || ep.parameters.some((p) => p.required && p.in !== "path")) continue;
    for (const role of ["anonymous", ...opts2.matrixRoles]) {
      add({ operation: ep.operation, method: "GET", path: ep.path, role, title: `${ep.operation} as ${role}`, tags: ["matrix"] });
    }
  }
  const setups = [];
  const unresolved = [];
  const isOwn = (v) => v.endsWith("IdOwn") || v.endsWith("Own");
  const stemOf = (v) => v.replace(/(Id)?Own$/, "").replace(/Id$/, "").toLowerCase();
  const names = (stem) => [stem, `${stem}s`, `${stem.replace(/y$/, "")}ies`];
  const nextId = () => `S${String(setups.length + 1).padStart(3, "0")}`;
  const creates = [];
  for (const variable of [...wantedVars].filter(isOwn)) {
    const stem = stemOf(variable);
    const source = inv.endpoints.filter((e) => e.method === "POST" && !e.path.includes("{") && e.request_body?.schema && names(stem).includes(lastSegment(e.path)) && !SIDE_EFFECT.test(`${e.path} ${e.operation_id ?? ""}`)).sort((a, b) => a.path.length - b.path.length)[0];
    if (!source || !source.request_body?.schema) {
      unresolved.push(variable);
      continue;
    }
    creates.push({
      id: "",
      title: `Setup: create a ${opts2.prefix} ${stem} to use as ${variable}`,
      operation: source.operation,
      method: "POST",
      path: source.path,
      role: opts2.role,
      body: withReferences(synthesize(source.request_body.schema, opts2.prefix), wantedVars),
      capture: { [variable]: "$find:id" },
      tags: ["setup", "creates-data"]
    });
  }
  for (const variable of [...wantedVars].filter((v) => !isOwn(v))) {
    const stem = stemOf(variable);
    const source = inv.endpoints.filter((e) => e.method === "GET" && !e.path.includes("{") && !e.parameters.some((p) => p.required && p.in !== "path") && names(stem).includes(lastSegment(e.path))).sort((a, b) => a.path.length - b.path.length)[0];
    if (!source) {
      unresolved.push(variable);
      continue;
    }
    setups.push({
      id: nextId(),
      title: `Setup: capture an existing ${stem} id as ${variable}`,
      operation: source.operation,
      method: "GET",
      path: source.path,
      role: opts2.role,
      capture: { [variable]: "$first:id" },
      tags: ["setup"]
    });
  }
  for (const c of creates) setups.push({ ...c, id: nextId() });
  const capped = [...setups, ...probes].slice(0, opts2.maxTotal + setups.length);
  for (const p of capped) if (p.needs) p.needs = p.needs.filter((v) => unresolved.includes(v));
  return { plan: { version: 1, name: "baseline", probes: capped.map((p) => p.needs?.length === 0 ? (({ needs: _n, ...rest }) => rest)(p) : p) }, excluded };
}

// core/lib/apirunner.ts
import fs3 from "node:fs";
import path3 from "node:path";

// core/lib/urlpolicy.ts
var TEST_LABEL = /(^|[-_.])(staging|stage|stg|dev|develop|test|testing|qa|uat|sandbox|demo|preview|local|localhost|internal|lan)([-_.]|\d|$)/i;
var PROD_LABEL = /(^|[-_.])(prod|production|prd|live)([-_.]|\d|$)/i;
var LOOPBACK_SUFFIXES = [".localhost", ".local", ".test", ".internal", ".lan"];
function parseUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}
function isLoopbackHost(host) {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}
function isPrivateIp(host) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}
function globToRegExp(glob) {
  const escaped = glob.trim().toLowerCase().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function matchesPattern(url, pattern) {
  let p = pattern.trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  if (!p) return false;
  if (p.endsWith("/") && !p.endsWith("*/")) p = p.slice(0, -1);
  const re = globToRegExp(p);
  const host = url.host.toLowerCase();
  const hostname = url.hostname.toLowerCase();
  const withPath = `${host}${url.pathname}`.replace(/\/+$/, "").toLowerCase();
  return re.test(host) || re.test(hostname) || re.test(withPath) || re.test(`${host}${url.pathname}`.toLowerCase());
}
function classifyUrl(raw, sec) {
  const u = parseUrl(raw);
  if (!u) return { verdict: "blocked", reason: `"${raw}" is not a valid http(s) URL` };
  const host = u.hostname.toLowerCase();
  const hit = sec.blocked_production_patterns.find((p) => matchesPattern(u, p));
  if (hit) return { verdict: "blocked", reason: `matches the blocked production pattern "${hit}"` };
  const listed = sec.not_production_hosts.some((h) => h.toLowerCase() === host || h.toLowerCase() === u.host.toLowerCase());
  if (!listed && PROD_LABEL.test(host)) {
    return { verdict: "blocked", reason: `the host "${host}" looks like production (add it to security.not_production_hosts only if it is not)` };
  }
  if (isLoopbackHost(host) || isPrivateIp(host) || LOOPBACK_SUFFIXES.some((s) => host.endsWith(s))) {
    return { verdict: "allowed", reason: "local or private address" };
  }
  if (TEST_LABEL.test(host) || listed) return { verdict: "allowed", reason: listed ? "listed in not_production_hosts" : "host name marks a test environment" };
  if (sec.confirmed_non_production) return { verdict: "allowed", reason: "environment.confirmed_non_production is true" };
  return {
    verdict: "ambiguous",
    reason: `"${host}" gives no sign of being a test environment; confirm it with the user, then set environment.confirmed_non_production: true`
  };
}
function originOf(raw) {
  const u = parseUrl(raw);
  return u ? u.origin : null;
}
function isRequestAllowed(policy, raw) {
  const u = parseUrl(raw);
  if (!u) return { allowed: false, reason: "not an http(s) URL" };
  const blocked = policy.blocked_patterns.find((p) => matchesPattern(u, p));
  if (blocked) return { allowed: false, reason: `matches blocked production pattern "${blocked}"` };
  if (policy.allowed_origins.includes(u.origin)) return { allowed: true, reason: "configured origin" };
  return { allowed: false, reason: `origin ${u.origin} is not one of the configured test origins` };
}

// core/lib/auth.ts
function jsonPathGet(value, expr) {
  const parts = expr.replace(/^\$\.?/, "").match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur = value;
  for (const part of parts) {
    if (cur === null || cur === void 0) return void 0;
    const idx = /^\[(\d+)\]$/.exec(part);
    if (idx) cur = Array.isArray(cur) ? cur[Number(idx[1])] : void 0;
    else cur = cur[part];
  }
  return cur;
}
function joinUrl(base, p, query) {
  const b = new URL(base);
  const url = /^https?:\/\//i.test(p) ? new URL(p) : new URL(`${b.origin}${b.pathname.replace(/\/+$/, "")}/${p.replace(/^\/+/, "")}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  return url.toString();
}
async function loginRole(args) {
  const { role, creds, login } = args;
  if (!creds) return { failure: `role "${role}" has no credentials in .env.qa`, secrets: [] };
  if (!login) return { failure: "api.login is not configured in .qa/config.md", secrets: [] };
  const url = joinUrl(args.baseUrl, login.path);
  const allowed = isRequestAllowed(args.policy, url);
  if (!allowed.allowed) return { failure: `login blocked: ${allowed.reason}`, secrets: [] };
  try {
    const res = await args.fetchImpl(url, {
      method: login.method,
      redirect: "manual",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ [login.username_field]: creds.username, [login.password_field]: creds.password }),
      signal: AbortSignal.timeout(args.timeoutMs)
    });
    if (!res.ok) return { failure: `login for "${role}" failed with HTTP ${res.status}`, secrets: [] };
    if (login.token_path === "cookie") {
      const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0] ?? "").filter(Boolean);
      if (!cookies.length) return { failure: `login for "${role}" set no cookie`, secrets: [] };
      return { cookie: cookies.join("; "), secrets: cookies.map((c) => c.split("=").slice(1).join("=")).filter((v) => v.length >= 4) };
    }
    const json = await res.json().catch(() => void 0);
    const token = jsonPathGet(json, login.token_path);
    if (typeof token !== "string" || !token) return { failure: `login for "${role}" returned no token at "${login.token_path}"`, secrets: [] };
    const sep = login.auth_header.indexOf(":");
    const name = login.auth_header.slice(0, sep).trim();
    const value = login.auth_header.slice(sep + 1).trim().replace("{token}", token);
    return { header: [name, value], secrets: [token] };
  } catch (err) {
    return { failure: `login for "${role}" could not be completed: ${err.message}`, secrets: [] };
  }
}

// core/lib/fsutil.ts
import fs from "node:fs";
import path from "node:path";
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n", "utf8");
  fs.renameSync(tmp, file);
}
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return void 0;
    throw new Error(`Cannot read ${file}: ${err.message}`);
  }
}
function exists(p) {
  return fs.existsSync(p);
}
function utcStamp(date = /* @__PURE__ */ new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// core/lib/openapi.ts
var import_yaml = __toESM(require_dist(), 1);
import fs2 from "node:fs";
import path2 from "node:path";
var isObj3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
function parseSpecText(text, hint = "") {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || hint.endsWith(".json")) return JSON.parse(trimmed);
  return (0, import_yaml.parse)(trimmed);
}
function loadSpecFile(file) {
  return parseSpecText(fs2.readFileSync(file, "utf8"), file);
}
function pointer(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Only local $ref values are supported (found "${ref}").`);
  let cur = root;
  for (const part of ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (!isObj3(cur) && !Array.isArray(cur)) return void 0;
    cur = cur[part];
  }
  return cur;
}
function deref(root, node, seen = [], depth = 0) {
  if (depth > 24) return node;
  if (Array.isArray(node)) return node.map((n) => deref(root, n, seen, depth + 1));
  if (!isObj3(node)) return node;
  if (typeof node["$ref"] === "string") {
    const ref = node["$ref"];
    if (seen.includes(ref)) return { type: "object", "x-circular": ref };
    const target = pointer(root, ref);
    if (target === void 0) return { "x-unresolved": ref };
    const { $ref: _drop, ...siblings } = node;
    const resolved = deref(root, target, [...seen, ref], depth + 1);
    return isObj3(resolved) ? { ...resolved, ...siblings } : resolved;
  }
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = deref(root, v, seen, depth + 1);
  return out;
}
function jsonContent(content) {
  if (!isObj3(content)) return void 0;
  const type = Object.keys(content).find((t) => t.includes("json")) ?? Object.keys(content)[0];
  if (!type) return void 0;
  const media = content[type];
  return { type, ...isObj3(media) && isObj3(media["schema"]) ? { schema: media["schema"] } : {} };
}
function normalizeSwagger2(doc) {
  const paths = isObj3(doc["paths"]) ? doc["paths"] : {};
  for (const item of Object.values(paths)) {
    if (!isObj3(item)) continue;
    for (const [m, op] of Object.entries(item)) {
      if (!METHODS.includes(m) || !isObj3(op)) continue;
      const params = Array.isArray(op["parameters"]) ? op["parameters"] : [];
      const body = params.find((p) => isObj3(p) && p["in"] === "body");
      if (body) op["requestBody"] = { required: body["required"] === true, content: { "application/json": { schema: body["schema"] } } };
      op["parameters"] = params.filter((p) => !isObj3(p) || p["in"] !== "body");
      if (isObj3(op["responses"])) {
        for (const r of Object.values(op["responses"])) {
          if (isObj3(r) && r["schema"] && !r["content"]) r["content"] = { "application/json": { schema: r["schema"] } };
        }
      }
    }
  }
  return doc;
}
function buildInventory(rawDoc, source) {
  if (!isObj3(rawDoc) || !isObj3(rawDoc["paths"])) throw new Error(`"${source}" does not look like an OpenAPI/Swagger document (no "paths").`);
  const doc = rawDoc["swagger"] ? normalizeSwagger2(rawDoc) : rawDoc;
  const resolved = deref(doc, doc);
  const info = isObj3(resolved["info"]) ? resolved["info"] : {};
  const globalSecurity = Array.isArray(resolved["security"]) ? resolved["security"] : void 0;
  const components = isObj3(resolved["components"]) ? resolved["components"] : {};
  const schemes = isObj3(components["securitySchemes"]) ? Object.keys(components["securitySchemes"]) : isObj3(resolved["securityDefinitions"]) ? Object.keys(resolved["securityDefinitions"]) : [];
  const endpoints = [];
  const paths = resolved["paths"];
  for (const [p, itemRaw] of Object.entries(paths)) {
    if (!isObj3(itemRaw)) continue;
    const shared = Array.isArray(itemRaw["parameters"]) ? itemRaw["parameters"] : [];
    for (const m of METHODS) {
      const op = itemRaw[m];
      if (!isObj3(op)) continue;
      const params = [...shared, ...Array.isArray(op["parameters"]) ? op["parameters"] : []].filter((x) => isObj3(x) && typeof x["name"] === "string").map((x) => ({
        name: x["name"],
        in: x["in"] ?? "query",
        required: x["required"] === true || x["in"] === "path",
        ...isObj3(x["schema"]) ? { schema: x["schema"] } : isObj3(x) && x["type"] ? { schema: { type: x["type"], ...x["enum"] ? { enum: x["enum"] } : {} } } : {}
      }));
      const rb = isObj3(op["requestBody"]) ? op["requestBody"] : void 0;
      const rbc = rb ? jsonContent(rb["content"]) : void 0;
      const security = Array.isArray(op["security"]) ? op["security"] : globalSecurity;
      const auth = security === void 0 ? "unknown" : security.length === 0 ? "none" : security.some((s) => isObj3(s) && Object.keys(s).length === 0) ? "none" : "required";
      const responses = [];
      if (isObj3(op["responses"])) {
        for (const [status, r] of Object.entries(op["responses"])) {
          const content = isObj3(r) ? jsonContent(r["content"]) : void 0;
          responses.push({ status, ...isObj3(r) && typeof r["description"] === "string" ? { description: r["description"] } : {}, ...content?.schema ? { schema: content.schema } : {} });
        }
      }
      endpoints.push({
        method: m.toUpperCase(),
        path: p,
        operation: `${m.toUpperCase()} ${p}`,
        ...typeof op["operationId"] === "string" ? { operation_id: op["operationId"] } : {},
        ...typeof op["summary"] === "string" ? { summary: op["summary"] } : {},
        ...typeof op["description"] === "string" ? { description: op["description"] } : {},
        tags: Array.isArray(op["tags"]) ? op["tags"] : [],
        auth,
        parameters: params,
        ...rb && rbc ? { request_body: { required: rb["required"] === true, content_type: rbc.type, ...rbc.schema ? { schema: rbc.schema } : {} } } : {},
        responses
      });
    }
  }
  const servers = Array.isArray(resolved["servers"]) ? resolved["servers"].map((s) => String(s["url"] ?? "")).filter(Boolean) : [];
  return {
    source,
    ...typeof info["title"] === "string" ? { title: info["title"] } : {},
    ...typeof info["version"] === "string" ? { version: info["version"] } : {},
    ...typeof (resolved["openapi"] ?? resolved["swagger"]) === "string" ? { openapi_version: String(resolved["openapi"] ?? resolved["swagger"]) } : {},
    servers,
    security_schemes: schemes,
    endpoints
  };
}
function statusDeclared(ep, status) {
  if (ep.responses.length === 0) return true;
  return ep.responses.some((r) => r.status === String(status) || r.status.toUpperCase() === `${Math.floor(status / 100)}XX` || r.status === "default");
}
function matchEndpoint(inv, method, requestPath) {
  const clean = requestPath.split("?")[0] ?? requestPath;
  const segs = clean.split("/").filter(Boolean);
  const candidates = inv.endpoints.filter((e) => e.method === method.toUpperCase());
  const score = (e) => {
    const es = e.path.split("/").filter(Boolean);
    if (es.length !== segs.length) return -1;
    let literal = 0;
    for (const [i, s] of es.entries()) {
      if (s.startsWith("{") && s.endsWith("}")) continue;
      if (s !== segs[i]) return -1;
      literal++;
    }
    return literal;
  };
  let best;
  let bestScore = -1;
  for (const e of candidates) {
    const s = score(e);
    if (s > bestScore) {
      best = e;
      bestScore = s;
    }
  }
  return best;
}
function resolveSpecPath(source, projectRoot) {
  return path2.isAbsolute(source) ? source : path2.resolve(projectRoot, source);
}

// core/lib/redact.ts
var SENSITIVE_KEY = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token|password|passwd|pwd|secret|client_secret|token|access_token|refresh_token|id_token|api_key|apikey|session|sessionid|session_id|csrf|jwt)$/i;
var JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/g;
var BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
var COOKIE_PAIR = /\b(session|sid|token|auth|jwt|csrf)[A-Za-z0-9_-]*=[^;\s,]{6,}/gi;
var REDACTED = "[REDACTED]";
function makeRedactor(knownSecrets = []) {
  const secrets = [...new Set(knownSecrets.filter((s) => s.length >= 4))].sort((a, b) => b.length - a.length);
  const text = (input) => {
    let out = input.replace(JWT, REDACTED).replace(BEARER, (_m, scheme) => `${scheme} ${REDACTED}`).replace(COOKIE_PAIR, (m) => `${m.split("=")[0]}=${REDACTED}`);
    for (const s of secrets) out = out.split(s).join(REDACTED);
    return out;
  };
  const json = (value, depth = 0) => {
    if (depth > 12) return REDACTED;
    if (typeof value === "string") return text(value);
    if (Array.isArray(value)) return value.map((v) => json(v, depth + 1));
    if (value && typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = SENSITIVE_KEY.test(k) && v !== null && v !== void 0 && v !== "" ? REDACTED : json(v, depth + 1);
      }
      return out;
    }
    return value;
  };
  const headers = (h) => {
    const out = {};
    for (const [k, v] of Object.entries(h)) out[k] = SENSITIVE_KEY.test(k) ? REDACTED : text(v);
    return out;
  };
  return { text, json: (v) => json(v), headers };
}
function findSecretLeaks(text, knownSecrets = [], opts2 = {}) {
  const leaks = [];
  if (opts2.generic !== false) {
    if (new RegExp(JWT.source).test(text)) leaks.push("JWT-like token");
    if (/\b(Bearer|Basic)\s+(?!\[REDACTED\])[A-Za-z0-9._~+/=-]{12,}/i.test(text)) leaks.push("Authorization header value");
  }
  for (const s of knownSecrets.filter((x) => x.length >= 4)) if (text.includes(s)) leaks.push("a configured test password or username value");
  return leaks;
}

// core/lib/apirunner.ts
var LEAK_PATTERNS = [
  // Node/V8 frames: "at fn (/abs/file.js:1:2)", "at async fn (file:///abs/file.mjs:1:2)", "at JSON.parse (<anonymous>)".
  // Matched anywhere, because JSON-encoded bodies carry newlines as a literal backslash-n.
  ["stack trace", /\bat\s+(?:async\s+)?[\w$.<>[\]]+\s*\((?:[^)\s]*[\\/][^)]*:\d+:\d+|<anonymous>|native)\)/],
  ["stack trace", /Traceback \(most recent call last\)|\bat [\w.$]+\([\w.]+\.java:\d+\)|\.php on line \d+|System\.\w+Exception|\bin [\w.\\/]+:line \d+/],
  ["database error text", /SQLSTATE\[|ORA-\d{4,5}|syntax error at or near|error in your SQL syntax|SequelizeDatabaseError|psycopg2\./i],
  ["server file path", /file:\/\/\/[^\s"'<>]{3,}|(?:\/Users\/|\/home\/[\w.-]+\/|\/var\/www\/|\/usr\/src\/|\/app\/|[A-Za-z]:\\(?:Users|inetpub|projects)\\)[^\s"'<>]{3,}/],
  ["server source path", /(?:\/[\w.-]+){3,}\.(?:mjs|cjs|js|ts|py|rb|php|java|cs|go)(?::\d+)?\b/],
  ["stack field in an error body", /"(?:stack|stacktrace|stack_trace|trace|traceback|backtrace)"\s*:\s*"/i]
];
var asList = (v) => Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [];
function firstArray(json) {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    for (const v of Object.values(json)) if (Array.isArray(v)) return v;
  }
  return void 0;
}
function findKey(json, key, depth = 0) {
  if (!json || typeof json !== "object" || depth > 3) return void 0;
  const obj = json;
  if (!Array.isArray(json) && key in obj && obj[key] !== null && typeof obj[key] !== "object") return obj[key];
  for (const v of Array.isArray(json) ? json.slice(0, 3) : Object.values(obj)) {
    const found = findKey(v, key, depth + 1);
    if (found !== void 0) return found;
  }
  return void 0;
}
function captureValue(json, expr) {
  const find = /^\$find:([\w.-]+)$/.exec(expr);
  if (find) return findKey(json, find[1]);
  const m = /^\$first:([\w.-]+)$/.exec(expr);
  if (!m) return jsonPathGet(json, expr);
  const item = firstArray(json)?.[0];
  return item && typeof item === "object" ? item[m[1]] : void 0;
}
function statusMatches(status, expectation) {
  const list = Array.isArray(expectation) ? expectation : [expectation];
  return list.some((e) => typeof e === "number" ? e === status : /^[1-5]xx$/i.test(e) ? Math.floor(status / 100) === Number(e[0]) : Number(e) === status);
}
function substitute(value, vars, missing) {
  if (typeof value === "string") {
    return value.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m, name) => {
      const v = vars[name];
      if (v === void 0) {
        missing.add(name);
        return `{{${name}}}`;
      }
      return v;
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars, missing));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars, missing)]));
  }
  return value;
}
async function runPlan(plan, opts2) {
  const planErrors = validatePlan(plan);
  if (planErrors.length) throw new Error(`The plan has problems:
  ${planErrors.join("\n  ")}`);
  const doFetch = opts2.fetchImpl ?? fetch;
  const slowMs = opts2.slowMs ?? 3e3;
  const timeoutMs = opts2.timeoutMs ?? 2e4;
  const maxBody = opts2.maxBodyChars ?? 6e3;
  const vars = { ...plan.vars ?? {} };
  const sessions = /* @__PURE__ */ new Map();
  let redactor = makeRedactor(opts2.roles.map((r) => r.password));
  const evidenceDir = path3.join(opts2.runDir, "evidence", "api");
  async function authFor(role) {
    if (role === "anonymous") return { secrets: [] };
    const cached = sessions.get(role);
    if (cached) return cached;
    const session = await loginRole({ role, creds: opts2.roles.find((r) => r.name === role), login: opts2.login, baseUrl: opts2.baseUrl, policy: opts2.policy, timeoutMs, fetchImpl: doFetch });
    if (session.secrets.length) redactor = makeRedactor([...opts2.roles.map((r) => r.password), ...session.secrets]);
    sessions.set(role, session);
    return session;
  }
  async function once(probe, url, session) {
    const headers = { accept: "application/json", ...probe.headers ?? {} };
    if (session.header) headers[session.header[0]] = session.header[1];
    if (session.cookie) headers["cookie"] = session.cookie;
    let body;
    if (probe.raw_body !== void 0) body = probe.raw_body;
    else if (probe.body !== void 0) body = JSON.stringify(probe.body);
    if (body !== void 0 && !Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
    const start = Date.now();
    try {
      const res = await doFetch(url, { method: probe.method, headers, ...body !== void 0 ? { body } : {}, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      const location = res.headers.get("location");
      const respHeaders = {};
      res.headers.forEach((v, k) => respHeaders[k] = v);
      if (location && res.status >= 300 && res.status < 400) {
        const target = new URL(location, url).toString();
        if (!isRequestAllowed(opts2.policy, target).allowed) respHeaders["x-qamind-blocked-redirect"] = target;
      }
      return { status: res.status, ms: Date.now() - start, headers: respHeaders, body: text.slice(0, maxBody), truncated: text.length > maxBody };
    } catch (err) {
      return { ms: Date.now() - start, error: err.message, headers: {}, body: "", truncated: false };
    }
  }
  function endpointFor(probe) {
    if (!opts2.inventory) return void 0;
    return (probe.operation ? opts2.inventory.endpoints.find((e) => e.operation === probe.operation) : void 0) ?? matchEndpoint(opts2.inventory, probe.method, probe.path);
  }
  function assess(probe, attempts) {
    const signals = [];
    const failures = [];
    const ep = endpointFor(probe);
    for (const a of attempts) {
      if (a.error) {
        signals.push({ kind: "network-error", detail: a.error });
        continue;
      }
      const status = a.status;
      if (status >= 500) signals.push({ kind: "server-error", detail: `HTTP ${status}` });
      if (a.headers["x-qamind-blocked-redirect"]) signals.push({ kind: "blocked-redirect", detail: `redirects to ${a.headers["x-qamind-blocked-redirect"]}, which is outside the allowed test origins; not followed` });
      for (const [label, re] of LEAK_PATTERNS) if (re.test(a.body)) signals.push({ kind: "error-leakage", detail: `response body contains a ${label}` });
      if (a.ms > slowMs) signals.push({ kind: "slow-response", detail: `${a.ms} ms (limit ${slowMs} ms)` });
      let json;
      try {
        json = a.truncated ? void 0 : JSON.parse(a.body);
      } catch {
        json = void 0;
      }
      if (ep) {
        if (status >= 200 && status < 400 && !statusDeclared(ep, status)) signals.push({ kind: "contract-status", detail: `HTTP ${status} is not documented for ${ep.operation}` });
        const spec = ep.responses.find((r) => r.status === String(status) || r.status.toUpperCase() === `${Math.floor(status / 100)}XX`);
        if (spec?.schema && json !== void 0) for (const m of validateSchema(json, spec.schema)) signals.push({ kind: "contract-schema", detail: m });
        if (probe.role === "anonymous" && ep.auth === "required" && status >= 200 && status < 300) signals.push({ kind: "auth-not-enforced", detail: `${ep.operation} answered ${status} without credentials` });
      }
      const exp = probe.expect;
      if (exp?.status !== void 0 && !statusMatches(status, exp.status)) failures.push(`expected HTTP ${JSON.stringify(exp.status)}, got ${status}`);
      for (const needle of asList(exp?.body_contains)) if (!a.body.includes(needle)) failures.push(`body does not contain "${needle}"`);
      for (const needle of asList(exp?.body_not_contains)) if (a.body.includes(needle)) failures.push(`body unexpectedly contains "${needle}"`);
      for (const c of exp?.json ?? []) {
        const v = jsonPathGet(json, c.path);
        if (c.exists !== void 0 && v !== void 0 !== c.exists) failures.push(`${c.path} ${c.exists ? "is missing" : "should not exist"}`);
        if ("equals" in c && JSON.stringify(v) !== JSON.stringify(c.equals)) failures.push(`${c.path} is ${JSON.stringify(v)}, expected ${JSON.stringify(c.equals)}`);
        if (c.lte !== void 0 && !(typeof v === "number" && v <= c.lte)) failures.push(`${c.path} is ${JSON.stringify(v)}, expected \u2264 ${c.lte}`);
        if (c.gte !== void 0 && !(typeof v === "number" && v >= c.gte)) failures.push(`${c.path} is ${JSON.stringify(v)}, expected \u2265 ${c.gte}`);
        if (c.matches !== void 0 && !(typeof v === "string" && new RegExp(c.matches).test(v))) failures.push(`${c.path} does not match /${c.matches}/`);
      }
    }
    if (probe.repeat && probe.repeat.count >= 2 && attempts.filter((a) => a.status !== void 0 && a.status >= 200 && a.status < 300).length >= 2) {
      signals.push({ kind: "duplicate-submission", detail: `${probe.repeat.count} identical requests were all accepted; check whether duplicates are created` });
    }
    const uniq = new Map(signals.map((s) => [`${s.kind}|${s.detail}`, s]));
    return { signals: [...uniq.values()], failures: [...new Set(failures)] };
  }
  const results = [];
  for (const raw of plan.probes) {
    const tags = raw.tags ?? [];
    const base = { id: raw.id, title: raw.title, role: raw.role, tags, ...raw.operation ? { operation: raw.operation } : {} };
    const skip = (reason) => results.push({ ...base, skipped: reason, statuses: [], ms: [], signals: [], expectation_failures: [] });
    if (opts2.readOnly && raw.method !== "GET") {
      skip("read-only run: non-GET probes are not executed");
      continue;
    }
    const missing = /* @__PURE__ */ new Set();
    const probe = substitute(raw, vars, missing);
    if (missing.size) {
      skip(`needs variable(s): ${[...missing].join(", ")}`);
      continue;
    }
    const url = joinUrl(opts2.baseUrl, probe.path, probe.query);
    const allowed = isRequestAllowed(opts2.policy, url);
    if (!allowed.allowed) {
      skip(`blocked by the production-safety policy: ${allowed.reason}`);
      continue;
    }
    const session = await authFor(probe.role);
    if (session.failure) {
      skip(session.failure);
      continue;
    }
    const runAttempts = async () => {
      const n = probe.repeat?.count ?? 1;
      if (probe.repeat?.parallel) return Promise.all(Array.from({ length: n }, () => once(probe, url, session)));
      const out2 = [];
      for (let i = 0; i < n; i++) out2.push(await once(probe, url, session));
      return out2;
    };
    const first = await runAttempts();
    let { signals, failures } = assess(probe, first);
    let attempts = first;
    let reproduced;
    if (signals.length > 0 || failures.length > 0) {
      const second = await runAttempts();
      const again = assess(probe, second);
      const kinds = (r) => /* @__PURE__ */ new Set([...r.signals.map((s) => s.kind), ...r.failures.length ? ["expectation"] : []]);
      const k1 = kinds({ signals, failures });
      const k2 = kinds(again);
      const same = [...k1].some((k) => k2.has(k));
      reproduced = { times: same ? 2 : 1, of: 2 };
      attempts = [...first, ...second];
      if (!same) {
        signals = [...signals, ...again.signals.filter((s) => !signals.some((x) => x.kind === s.kind && x.detail === s.detail))];
        failures = [.../* @__PURE__ */ new Set([...failures, ...again.failures])];
      }
    }
    let evidence;
    if (signals.length > 0 || failures.length > 0 || probe.keep_evidence === true) {
      ensureDir(evidenceDir);
      const file = path3.join(evidenceDir, `${plan.name}-${raw.id}.json`);
      const reqBody = probe.raw_body !== void 0 ? redactor.text(probe.raw_body) : probe.body !== void 0 ? JSON.stringify(redactor.json(probe.body)) : void 0;
      const headerFlags = [probe.role !== "anonymous" ? `-H 'Authorization: Bearer $TOKEN'` : "", reqBody !== void 0 ? `-H 'Content-Type: application/json'` : ""].filter(Boolean).join(" ");
      const curl = `curl -sS -i -X ${probe.method} '${url}' ${headerFlags}${reqBody !== void 0 ? ` --data '${reqBody.replace(/'/g, "'\\''")}'` : ""}`.replace(/\s+/g, " ").trim();
      writeJson(file, {
        probe: { id: raw.id, title: raw.title, operation: raw.operation, role: probe.role },
        curl,
        curl_note: probe.role === "anonymous" ? "No credentials are needed." : "Set TOKEN to a valid token for this role (log in first); the real token is never saved in evidence.",
        attempts: attempts.map((a) => ({
          status: a.status ?? null,
          ms: a.ms,
          ...a.error ? { error: redactor.text(a.error) } : {},
          request: { method: probe.method, url, headers: redactor.headers({ ...probe.headers ?? {}, ...probe.role !== "anonymous" ? { Authorization: "[token]" } : {} }), ...reqBody !== void 0 ? { body: reqBody } : {} },
          response: { headers: redactor.headers(a.headers), body: redactor.text(a.body), ...a.truncated ? { truncated: true } : {} }
        })),
        signals,
        expectation_failures: failures,
        reproduced
      });
      evidence = path3.relative(opts2.runDir, file).split(path3.sep).join("/");
    }
    for (const [name2, expr] of Object.entries(probe.capture ?? {})) {
      const last = attempts[attempts.length - 1];
      try {
        const v = last && !last.truncated ? captureValue(JSON.parse(last.body), expr) : void 0;
        if (v !== void 0 && v !== null) vars[name2] = String(v);
      } catch {
      }
    }
    results.push({
      ...base,
      statuses: attempts.map((a) => a.status ?? "error"),
      ms: attempts.map((a) => a.ms),
      signals,
      expectation_failures: failures,
      ...reproduced ? { reproduced } : {},
      ...evidence ? { evidence } : {}
    });
  }
  const byOp = /* @__PURE__ */ new Map();
  for (const r of results) {
    if (!r.tags.includes("matrix") || !r.operation) continue;
    const row = byOp.get(r.operation) ?? {};
    row[r.role] = r.skipped ? "skipped" : r.statuses[0] ?? "error";
    byOp.set(r.operation, row);
  }
  const executed = results.filter((r) => !r.skipped);
  const failed = executed.filter((r) => r.signals.length > 0 || r.expectation_failures.length > 0);
  const summary = {
    plan: plan.name,
    total: results.length,
    passed: executed.length - failed.length,
    failed: failed.length,
    skipped: results.length - executed.length,
    signals: executed.reduce((n, r) => n + r.signals.length + r.expectation_failures.length, 0),
    ran_at: (/* @__PURE__ */ new Date()).toISOString()
  };
  const out = { summary, results, matrix: [...byOp].map(([operation, statuses]) => ({ operation, statuses })) };
  const dir = path3.join(opts2.runDir, "data", "api-results");
  ensureDir(dir);
  let name = `${plan.name}.json`;
  for (let n = 2; fs3.existsSync(path3.join(dir, name)); n++) name = `${plan.name}-${n}.json`;
  writeJson(path3.join(dir, name), out);
  return out;
}

// core/lib/config.ts
var import_yaml2 = __toESM(require_dist(), 1);
import fs5 from "node:fs";
import path5 from "node:path";

// core/lib/dotenv.ts
import fs4 from "node:fs";
import path4 from "node:path";
function parseDotenv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = (m[2] ?? "").trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    out[m[1]] = value;
  }
  return out;
}
function loadQaEnv(projectRoot, processEnv = process.env, names) {
  const file = path4.join(projectRoot, ".env.qa");
  const fileFound = fs4.existsSync(file);
  const fromFile = fileFound ? parseDotenv(fs4.readFileSync(file, "utf8")) : {};
  const values = { ...fromFile };
  for (const name of names ?? Object.keys(fromFile)) {
    const v = processEnv[name];
    if (v !== void 0 && v !== "") values[name] = v;
  }
  return { fileFound, values };
}

// core/lib/config.ts
var SEVERITIES = ["critical", "important", "minor"];
var CONFIG_SCHEMA_VERSION = 1;
var PLACEHOLDER = "REPLACE_ME";
function splitFrontMatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/.exec(text);
  return m ? { yaml: m[1] ?? "", body: m[2] ?? "" } : null;
}
var ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
var isObj4 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var str = (v) => typeof v === "string" && v.trim() !== "" ? v.trim() : void 0;
var strList = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
function normalizeConfig(raw, problems) {
  if (!isObj4(raw)) {
    problems.push("The front matter at the top of config.md is empty or not a YAML mapping.");
    return void 0;
  }
  const schema = typeof raw["schema_version"] === "number" ? raw["schema_version"] : 0;
  if (schema !== CONFIG_SCHEMA_VERSION) problems.push(`schema_version must be ${CONFIG_SCHEMA_VERSION} (found ${String(raw["schema_version"])}).`);
  const env = isObj4(raw["environment"]) ? raw["environment"] : {};
  const sec = isObj4(raw["security"]) ? raw["security"] : {};
  const api = isObj4(raw["api"]) ? raw["api"] : {};
  const login = isObj4(api["login"]) ? api["login"] : void 0;
  const web_uis = [];
  if (raw["web_uis"] !== void 0 && !Array.isArray(raw["web_uis"])) problems.push("web_uis must be a list.");
  for (const [i, item] of (Array.isArray(raw["web_uis"]) ? raw["web_uis"] : []).entries()) {
    const name = isObj4(item) ? str(item["name"]) : void 0;
    const url = isObj4(item) ? str(item["url"]) : void 0;
    if (!name || !url) problems.push(`web_uis[${i}] needs a name and a url.`);
    else web_uis.push({ name, url });
  }
  const roles = [];
  if (raw["roles"] !== void 0 && !Array.isArray(raw["roles"])) problems.push("roles must be a list.");
  for (const [i, item] of (Array.isArray(raw["roles"]) ? raw["roles"] : []).entries()) {
    const o = isObj4(item) ? item : {};
    const name = str(o["name"]);
    const ui = str(o["ui"]);
    const username_env = str(o["username_env"]);
    const password_env = str(o["password_env"]);
    if (!name || !ui || !username_env || !password_env) {
      problems.push(`roles[${i}] needs name, ui, username_env and password_env.`);
      continue;
    }
    for (const v of [username_env, password_env]) if (!ENV_NAME.test(v)) problems.push(`roles[${i}]: "${v}" is not a valid environment variable name.`);
    const tenant = str(o["tenant"]);
    roles.push({ name, ui, username_env, password_env, ...tenant ? { tenant } : {} });
  }
  const fixRaw = isObj4(raw["fix_policy"]) ? strList(raw["fix_policy"]["fix_severities"]) : ["critical", "important"];
  const fix_severities = fixRaw.filter((s) => SEVERITIES.includes(s));
  if (fixRaw.length !== fix_severities.length) problems.push("fix_policy.fix_severities may only contain critical, important, minor.");
  const baseUrl = str(api["base_url"]);
  const openapi = str(api["openapi"]);
  const config = {
    schema_version: schema,
    environment: { name: str(env["name"]) ?? "test", confirmed_non_production: env["confirmed_non_production"] === true },
    web_uis,
    api: {
      ...baseUrl && baseUrl.toLowerCase() !== "none" ? { base_url: baseUrl } : {},
      ...openapi && openapi.toLowerCase() !== "none" ? { openapi } : {},
      ...login ? {
        login: {
          path: str(login["path"]) ?? "/login",
          method: (str(login["method"]) ?? "POST").toUpperCase(),
          username_field: str(login["username_field"]) ?? "email",
          password_field: str(login["password_field"]) ?? "password",
          token_path: str(login["token_path"]) ?? "token",
          auth_header: str(login["auth_header"]) ?? "Authorization: Bearer {token}"
        }
      } : {}
    },
    security: {
      blocked_production_patterns: strList(sec["blocked_production_patterns"]),
      not_production_hosts: strList(sec["not_production_hosts"]),
      allowed_extra_origins: strList(sec["allowed_extra_origins"]),
      confirmed_non_production: env["confirmed_non_production"] === true
    },
    test_data_prefix: str(raw["test_data_prefix"]) ?? "QA-",
    roles,
    fix_policy: { fix_severities: fix_severities.length ? fix_severities : ["critical", "important"] },
    health: { checks: isObj4(raw["health"]) ? strList(raw["health"]["checks"]) : [] }
  };
  return config;
}
function configUrls(c) {
  const out = c.web_uis.map((u) => ({ label: `web_uis "${u.name}"`, url: u.url }));
  if (c.api.base_url) out.push({ label: "api.base_url", url: c.api.base_url });
  if (c.api.openapi && parseUrl(c.api.openapi)) out.push({ label: "api.openapi", url: c.api.openapi });
  for (const o of c.security.allowed_extra_origins) out.push({ label: "security.allowed_extra_origins", url: o });
  return out;
}
function checkConfigText(text, opts2) {
  const result = { status: "ok", problems: [], blocked: [], ambiguous: [], missing_env: [], advisories: [] };
  const fm = splitFrontMatter(text);
  if (!fm) {
    result.status = "invalid";
    result.problems.push("config.md must start with a YAML front-matter block between two --- lines.");
    return result;
  }
  result.body = fm.body;
  const leftovers = text.split(/\r?\n/).filter((l) => l.includes(PLACEHOLDER) && !l.trim().startsWith("#") && !l.trim().startsWith("<!--"));
  let raw;
  try {
    raw = (0, import_yaml2.parse)(fm.yaml);
  } catch (err) {
    result.status = "invalid";
    result.problems.push(`The front matter is not valid YAML: ${err.message.split("\n")[0]}`);
    return result;
  }
  const config = normalizeConfig(raw, result.problems);
  if (!config) {
    result.status = "invalid";
    return result;
  }
  result.config = config;
  if (leftovers.length > 0) {
    result.status = "unfilled";
    result.problems.push(`${leftovers.length} value(s) are still ${PLACEHOLDER}. Fill in the template before testing:`);
    for (const l of leftovers.slice(0, 8)) result.problems.push(`  ${l.trim()}`);
    return result;
  }
  if (config.web_uis.length === 0 && !config.api.base_url) result.problems.push("Nothing to test: add at least one entry under web_uis or set api.base_url.");
  if (config.roles.length === 0) result.problems.push("Add at least one test account under roles.");
  if (config.security.blocked_production_patterns.length === 0) result.problems.push("security.blocked_production_patterns is empty: list your production host names so they can never be tested.");
  const uiNames = new Set(config.web_uis.map((u) => u.name));
  for (const r of config.roles) if (r.ui !== "api" && !uiNames.has(r.ui)) result.problems.push(`Role "${r.name}" refers to ui "${r.ui}", which is not in web_uis (use a web_uis name or "api").`);
  const tenants = new Set(config.roles.filter((r) => r.tenant).map((r) => r.tenant));
  if (config.roles.some((r) => r.tenant) && tenants.size < 2) {
    result.advisories.push("Only one customer (tenant) has a test account, so data-isolation between customers cannot be checked. Add a second client account.");
  }
  if (config.api.openapi && !parseUrl(config.api.openapi) && !fs5.existsSync(path5.resolve(opts2.projectRoot, config.api.openapi))) {
    result.problems.push(`api.openapi points to "${config.api.openapi}", which does not exist in the project.`);
  }
  for (const { label, url } of configUrls(config)) {
    if (!parseUrl(url)) {
      result.problems.push(`${label}: "${url}" is not a valid http(s) URL.`);
      continue;
    }
    const verdict = classifyUrl(url, config.security);
    if (verdict.verdict === "blocked") result.blocked.push({ url, reason: `${label} ${verdict.reason}` });
    if (verdict.verdict === "ambiguous") result.ambiguous.push({ url, reason: `${label}: ${verdict.reason}` });
  }
  const names = config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(opts2.projectRoot, opts2.env ?? process.env, names);
  result.missing_env = [...new Set(names.filter((n) => !values[n]))];
  if (result.blocked.length > 0) result.status = "blocked-url";
  else if (result.problems.length > 0) result.status = "invalid";
  else if (result.ambiguous.length > 0) result.status = "ambiguous-url";
  return result;
}
function checkConfigFile(projectRoot, env) {
  const file = path5.join(projectRoot, ".qa", "config.md");
  return checkConfigText(fs5.readFileSync(file, "utf8"), { projectRoot, ...env ? { env } : {} });
}
function policyFromConfig(c) {
  const origins = /* @__PURE__ */ new Set();
  for (const { url } of configUrls(c)) {
    const o = originOf(url);
    if (o) origins.add(o);
  }
  return { allowed_origins: [...origins].sort(), blocked_patterns: [...c.security.blocked_production_patterns] };
}

// core/lib/guardpolicy.ts
import fs11 from "node:fs";
import path13 from "node:path";

// core/lib/run.ts
import fs10 from "node:fs";
import path12 from "node:path";

// core/lib/corepath.ts
import path6 from "node:path";
import { fileURLToPath } from "node:url";
function corePath() {
  const here = path6.dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env["QAMIND_CORE"], path6.resolve(here, "../core"), path6.resolve(here, "..")].filter((c) => !!c);
  for (const c of candidates) if (exists(path6.join(c, "shared", "templates", "config.md"))) return c;
  throw new Error(`Cannot locate QAMind's core files (looked in: ${candidates.join(", ")}).`);
}

// core/lib/git.ts
import { execFileSync } from "node:child_process";
function git(root, args) {
  try {
    return execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch {
    return void 0;
  }
}
function gitInfo(root) {
  if (git(root, ["rev-parse", "--is-inside-work-tree"]) !== "true") return { is_repo: false, changed_files: [] };
  const branch = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = git(root, ["rev-parse", "--short", "HEAD"]);
  const status = git(root, ["status", "--porcelain"]) ?? "";
  const originHead = git(root, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const candidates = [originHead, "main", "master"].filter((x) => !!x);
  const base = candidates.find((c) => git(root, ["rev-parse", "--verify", "--quiet", c]) !== void 0);
  const changed = /* @__PURE__ */ new Set();
  if (base && branch && branch !== base.replace(/^origin\//, "")) {
    for (const f of (git(root, ["diff", "--name-only", `${base}...HEAD`]) ?? "").split("\n")) if (f) changed.add(f);
  }
  for (const line of status.split("\n")) {
    const file = line.slice(3).trim().replace(/^.* -> /, "");
    if (file && !file.startsWith(".qa/")) changed.add(file);
  }
  return {
    is_repo: true,
    ...branch ? { branch } : {},
    ...commit ? { commit } : {},
    ...base ? { base } : {},
    dirty: status.length > 0,
    changed_files: [...changed].slice(0, 300)
  };
}

// core/lib/gitignore.ts
import fs6 from "node:fs";
import path7 from "node:path";
var QA_GITIGNORE_ENTRIES = [".env.qa", ".qa/"];
function isCovered(lines, entry) {
  const bare = entry.replace(/\/$/, "");
  const accepted = /* @__PURE__ */ new Set([entry, bare, `/${entry}`, `/${bare}`, `${bare}/`, `/${bare}/`]);
  return lines.some((l) => accepted.has(l.trim()));
}
function ensureGitignoreEntries(root, entries = QA_GITIGNORE_ENTRIES) {
  const file = path7.join(root, ".gitignore");
  const current = fs6.existsSync(file) ? fs6.readFileSync(file, "utf8") : "";
  const lines = current.split(/\r?\n/);
  const missing = entries.filter((e) => !isCovered(lines, e));
  if (missing.length === 0) return [];
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  let next = current;
  if (next !== "" && !next.endsWith("\n")) next += eol;
  if (next !== "") next += eol;
  next += `# QAMind (private test credentials and reports)${eol}${missing.join(eol)}${eol}`;
  fs6.writeFileSync(file, next, "utf8");
  return missing;
}

// core/lib/paths.ts
import os from "node:os";
import path8 from "node:path";
var SCHEMA_VERSION = 1;
function qamindHome(env = process.env) {
  const override = env["QAMIND_HOME"];
  return override && override.trim() !== "" ? path8.resolve(override) : path8.join(os.homedir(), ".qamind");
}
function projectsRoot(home) {
  return path8.join(home, "projects");
}
function storeDir(home, projectId) {
  return path8.join(projectsRoot(home), projectId);
}
function storeSubdirs(store) {
  return {
    memory: path8.join(store, "memory"),
    runs: path8.join(store, "memory", "runs"),
    state: path8.join(store, "state"),
    testBank: path8.join(store, "test-bank"),
    baselines: path8.join(store, "baselines"),
    backups: path8.join(store, "backups")
  };
}
var RUN_MARKER_FILE = "run-marker.json";

// core/lib/project.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import crypto from "node:crypto";
import fs7 from "node:fs";
import path9 from "node:path";
function normalizeGitRemote(url) {
  let s = url.trim();
  if (!s) return null;
  const scp = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.+)$/.exec(s);
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    s = `${scp[1]}/${scp[2]}`;
  } else {
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/^[^@/]+@/, "");
  }
  s = s.replace(/[?#].*$/, "").replace(/\.git$/i, "").replace(/\/+$/, "").replace(/:\d+(?=\/)/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.join("/").toLowerCase();
}
function slug(text, max = 60) {
  return text.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max) || "project";
}
function sha(text, len) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, len);
}
function gitOutput(root, args) {
  try {
    return execFileSync2("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return void 0;
  }
}
function isGitRepo(root) {
  return gitOutput(root, ["rev-parse", "--is-inside-work-tree"]) === "true";
}
function resolveProject(root) {
  const real = fs7.realpathSync(root);
  const name = path9.basename(real);
  const remoteRaw = gitOutput(real, ["remote", "get-url", "origin"]);
  const remote = remoteRaw ? normalizeGitRemote(remoteRaw) : null;
  if (remote) {
    return { id: `${slug(remote.replace(/\//g, "-"))}-${sha(remote, 8)}`, name: remote.split("/").pop() ?? name, root: real, idSource: "git-remote", gitRemote: remote };
  }
  const key = process.platform === "win32" ? real.toLowerCase() : real;
  return { id: `path-${slug(name, 40)}-${sha(key, 12)}`, name, root: real, idSource: "path" };
}
var PROJECT_MARKERS = ["package.json", "composer.json", "pyproject.toml", "requirements.txt", "manage.py", "Gemfile", "pom.xml", "build.gradle", "go.mod", "Cargo.toml"];
function looksLikeProject(root) {
  if (exists(path9.join(root, ".qa", "config.md"))) return true;
  if (isGitRepo(root)) return true;
  if (PROJECT_MARKERS.some((m) => exists(path9.join(root, m)))) return true;
  try {
    return fs7.readdirSync(root).some((f) => f.endsWith(".csproj") || f.endsWith(".sln"));
  } catch {
    return false;
  }
}
function ensureProjectStore(home, info, now = /* @__PURE__ */ new Date()) {
  const store = storeDir(home, info.id);
  const dirs = storeSubdirs(store);
  for (const d of Object.values(dirs)) ensureDir(d);
  const file = path9.join(store, "project.json");
  const existing = readJson(file);
  if (existing && existing.schema_version > SCHEMA_VERSION) {
    throw new Error(
      `Memory for this project was written by a newer QAMind (schema ${existing.schema_version}, this is ${SCHEMA_VERSION}). Update QAMind before running.`
    );
  }
  const stamp = now.toISOString();
  const project = existing ?? {
    schema_version: SCHEMA_VERSION,
    id: info.id,
    id_source: info.idSource,
    name: info.name,
    ...info.gitRemote ? { git_remote: info.gitRemote } : {},
    paths_seen: [],
    created: stamp,
    last_seen: stamp
  };
  if (!project.paths_seen.includes(info.root)) project.paths_seen.push(info.root);
  project.last_seen = stamp;
  writeJson(file, project);
  return { store, project };
}
function listKnownProjects(home) {
  const root = projectsRoot(home);
  if (!exists(root)) return [];
  const out = [];
  for (const entry of fs7.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = readJson(path9.join(root, entry.name, "project.json"));
    if (p) out.push({ id: p.id, name: p.name, paths_seen: p.paths_seen, last_seen: p.last_seen });
  }
  return out.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
}

// core/lib/report.ts
import fs8 from "node:fs";
import path10 from "node:path";
var SURFACES = ["api", "ui", "cross", "permissions", "business-rule", "other"];
var dataFile = (runDir, name) => path10.join(runDir, "data", name);
function readList(runDir, name) {
  const v = readJson(dataFile(runDir, name));
  if (v === void 0) return [];
  if (!Array.isArray(v)) throw new Error(`data/${name} must be a JSON array.`);
  return v;
}
function readRunData(runDir) {
  const apiDir = path10.join(runDir, "data", "api-results");
  const apiSummaries = [];
  if (fs8.existsSync(apiDir)) {
    for (const f of fs8.readdirSync(apiDir).filter((x) => x.endsWith(".json")).sort()) {
      const r = readJson(path10.join(apiDir, f));
      if (r?.summary) apiSummaries.push({ file: `data/api-results/${f}`, ...r.summary });
    }
  }
  const meta = readJson(dataFile(runDir, "meta.json"));
  const health = readJson(dataFile(runDir, "health.json"));
  return {
    ...meta ? { meta } : {},
    charters: readList(runDir, "charters.json"),
    findings: readList(runDir, "findings.json"),
    unconfirmed: readList(runDir, "unconfirmed.json"),
    notTested: readList(runDir, "not-tested.json"),
    coverage: readList(runDir, "coverage.json"),
    ...health ? { health } : {},
    apiSummaries
  };
}
function assignIds(runDir, data) {
  let max = 0;
  for (const f of data.findings) {
    const m = /^ISSUE-(\d+)$/.exec(f.id ?? "");
    if (m) max = Math.max(max, Number(m[1]));
  }
  let changed = false;
  for (const f of data.findings) {
    if (!f.id) {
      f.id = `ISSUE-${String(++max).padStart(3, "0")}`;
      changed = true;
    }
  }
  let umax = 0;
  for (const u of data.unconfirmed) {
    const m = /^UNCONFIRMED-(\d+)$/.exec(u.id ?? "");
    if (m) umax = Math.max(umax, Number(m[1]));
  }
  for (const u of data.unconfirmed) {
    if (!u.id) {
      u.id = `UNCONFIRMED-${String(++umax).padStart(2, "0")}`;
      changed = true;
    }
  }
  if (changed) {
    writeJson(dataFile(runDir, "findings.json"), data.findings);
    writeJson(dataFile(runDir, "unconfirmed.json"), data.unconfirmed);
  }
}
var ICON = { critical: "\u{1F534}", important: "\u{1F7E0}", minor: "\u{1F7E1}" };
var LABEL = { critical: "Critical", important: "Important", minor: "Minor" };
var sevRank = (s) => SEVERITIES.indexOf(s);
function countBySeverity(findings) {
  const c = { critical: 0, important: 0, minor: 0 };
  for (const f of findings) if (f.severity in c) c[f.severity] += 1;
  return c;
}
function mergedNotTested(data) {
  const out = [...data.notTested];
  const seen = new Set(out.map((n) => n.area.toLowerCase()));
  for (const row of data.coverage) {
    if (row.status === "not-tested") {
      const label = [row.surface, row.area, row.role, row.viewport].filter(Boolean).join(" / ");
      if (!seen.has(label.toLowerCase()) && !seen.has(row.area.toLowerCase())) {
        out.push({ area: label, reason: row.note ?? "Reason not recorded" });
        seen.add(label.toLowerCase());
      }
    }
  }
  return out;
}
var esc = (s) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
function duration(seconds) {
  if (seconds === void 0) return "in progress";
  const m = Math.floor(seconds / 60);
  return `${m}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
}
function renderTechnicalReport(data) {
  const m = data.meta;
  const counts = countBySeverity(data.findings);
  const notTested = mergedNotTested(data);
  const L = [];
  L.push(`# QAMind Technical Report${m ? `: ${m.run_id}` : ""}`, "");
  if (m) {
    L.push("| | |", "|---|---|");
    const rows = [
      ["Date (UTC)", m.started],
      ["Project", `${m.project_name} (${m.project_id})`],
      ["Environment", m.environment],
      ["Branch / commit", m.branch ? `${m.branch}${m.commit ? ` @ ${m.commit}` : ""}` : "not a git repository"],
      ["Mode", m.mode],
      ["Trigger", m.trigger],
      ["Scope", m.focus ? `focus: ${m.focus}` : m.mode === "diff" ? "changed code and its neighbours" : "whole product"],
      ["Host", m.host],
      ["Duration", duration(m.duration_s)],
      ["Cost / usage", m.cost ?? "not available on this host"],
      ["QAMind / knowledge version", `${m.agent_version} / ${m.knowledge_version}`],
      ["Stop reason", m.stop_reason ?? "run not finished"]
    ];
    for (const [k, v] of rows) L.push(`| ${k} | ${esc(v)} |`);
    L.push("");
  }
  L.push("## Environment health", "");
  if (!data.health) L.push("_Health check was not run._", "");
  else {
    L.push(data.health.environment_ok ? "**Environment OK.**" : "**\u26D4 Environment problem: product findings are not reliable until this is fixed.**", "");
    L.push("| Check | Result | Detail |", "|---|---|---|");
    for (const c of data.health.checks) L.push(`| ${esc(c.name)} | ${c.skipped ? "\u2796 skipped" : c.ok ? "\u2705 ok" : "\u274C failed"} | ${esc(c.detail)}${c.ms !== void 0 ? ` (${c.ms} ms)` : ""} |`);
    L.push("");
  }
  L.push("## Summary", "");
  L.push(`- \u{1F534} Critical: **${counts.critical}**   \u{1F7E0} Important: **${counts.important}**   \u{1F7E1} Minor: **${counts.minor}**`);
  L.push(`- Unconfirmed (not reproduced twice): **${data.unconfirmed.length}**`);
  L.push(`- Areas not tested: **${notTested.length}**`);
  const api = data.apiSummaries.reduce((a, s) => ({ total: a.total + s.total, failed: a.failed + s.failed, signals: a.signals + s.signals }), { total: 0, failed: 0, signals: 0 });
  if (data.apiSummaries.length) L.push(`- API probes executed: **${api.total}** (${api.signals} produced a signal worth a look)`);
  L.push("");
  L.push("## Test plan (charters)", "");
  if (data.charters.length === 0) L.push("_No charters recorded._", "");
  for (const c of data.charters) {
    L.push(`### ${c.id}: ${c.title}  \`${c.surface}\``, "", `- **Goal:** ${c.goal}`, `- **Risk:** ${c.risk}`, `- **Entry point:** ${c.entry_point}`, `- **Expected results:** ${c.expected}`, `- **Exit condition:** ${c.exit_condition}`, "");
  }
  L.push("## Findings", "");
  const sorted = [...data.findings].sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.id ?? "").localeCompare(b.id ?? ""));
  if (sorted.length === 0) L.push("_No confirmed findings._", "");
  for (const f of sorted) {
    L.push(`### ${f.id ?? "ISSUE-???"} ${ICON[f.severity]} ${LABEL[f.severity]}: ${f.title}`, "");
    L.push(`- **Surface:** ${f.surface}${f.ui ? ` \xB7 **UI:** ${f.ui}` : ""} \xB7 **Area:** ${f.area} \xB7 **Type:** ${f.type}`);
    if (f.roles?.length) L.push(`- **Roles:** ${f.roles.join(", ")}`);
    if (f.browser || f.viewport) L.push(`- **Browser / viewport:** ${[f.browser, f.viewport].filter(Boolean).join(" / ")}`);
    L.push(`- **Reproduced:** ${f.reproduced.times} of ${f.reproduced.of} attempts`);
    if (f.charter) L.push(`- **Charter:** ${f.charter}`);
    L.push("", f.summary, "", "**Steps to reproduce**", "");
    f.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`));
    L.push("", `**Expected:** ${f.expected}`, "", `**Actual:** ${f.actual}`, "");
    L.push("**Evidence**", "", ...f.evidence.map((e) => `- [${e}](${e})`), "");
    if (f.suspected_cause) L.push(`**Suspected root cause:** ${f.suspected_cause}`, "");
    if (f.regression_test) L.push(`**Proposed regression test:** ${f.regression_test.description}${f.regression_test.location ? ` (suggested location: \`${f.regression_test.location}\`)` : ""}`, "");
    if (f.memory_applied?.length) L.push(`**Memory applied:** ${f.memory_applied.join("; ")}`, "");
  }
  L.push("## Unconfirmed (could not be reproduced twice)", "", "_These are leads, not findings. They are not counted above._", "");
  if (data.unconfirmed.length === 0) L.push("_None._", "");
  for (const u of data.unconfirmed) {
    L.push(`- **${u.id ?? "UNCONFIRMED"}: ${u.title}** (${u.surface}, tried ${u.attempts}\xD7): ${u.observation} Why unconfirmed: ${u.why_unconfirmed}`);
    for (const e of u.evidence ?? []) L.push(`  - evidence: [${e}](${e})`);
  }
  if (data.unconfirmed.length) L.push("");
  L.push("## Coverage matrix", "");
  if (data.coverage.length === 0) L.push("_No coverage recorded._", "");
  else {
    L.push("| Surface | Area | Role | Viewport | Status | Note |", "|---|---|---|---|---|---|");
    const mark = { tested: "\u2705 tested", partial: "\u25D0 partial", "not-tested": "\u26D4 not tested" };
    for (const r of data.coverage) L.push(`| ${esc(r.surface)} | ${esc(r.area)} | ${esc(r.role ?? "-")} | ${esc(r.viewport ?? "-")} | ${mark[r.status]} | ${esc(r.note ?? "")} |`);
    L.push("");
  }
  L.push("## Not tested", "", "_Nothing here is reported as passing._", "");
  if (notTested.length === 0) L.push("_Everything planned was tested._", "");
  for (const n of notTested) L.push(`- **${n.area}**: ${n.reason}`);
  if (notTested.length) L.push("");
  if (data.apiSummaries.length) {
    L.push("## API test runs", "", "| Plan | Probes | Passed | Failed | Signals | Details |", "|---|---|---|---|---|---|");
    for (const s of data.apiSummaries) L.push(`| ${esc(s.plan)} | ${s.total} | ${s.passed} | ${s.failed} | ${s.signals} | [${s.file}](${s.file}) |`);
    L.push("");
  }
  L.push("## Memory", "");
  L.push(m?.memory_applied?.length ? m.memory_applied.map((x) => `- Applied: ${x}`).join("\n") : "_No project memory was applied (first run, or memory held nothing relevant)._", "");
  L.push("_Learnings are not written in this version; the run summary and detected stack are saved to the private user store._", "");
  const tests = sorted.filter((f) => f.regression_test);
  L.push("## Proposed regression tests", "", "_/qa-only never writes tests into the product; these are proposals._", "");
  if (tests.length === 0) L.push("_None._", "");
  for (const f of tests) L.push(`- **${f.id}**: ${f.regression_test?.description}${f.regression_test?.location ? ` \u2192 \`${f.regression_test.location}\`` : ""}`);
  if (m?.notes?.length) L.push("", "## Notes", "", ...m.notes.map((n) => `- ${n}`));
  L.push("");
  return L.join("\n");
}
function insideRun(runDir, rel) {
  const abs = path10.resolve(runDir, rel);
  const root = path10.resolve(runDir) + path10.sep;
  return abs.startsWith(root) ? abs : null;
}
function lintRun(runDir, data, knownSecrets = []) {
  const errors = [];
  const warnings = [];
  if (data.charters.length === 0) errors.push("No charters recorded: write the test plan before reporting (data/charters.json).");
  const ids = /* @__PURE__ */ new Set();
  for (const [i, f] of data.findings.entries()) {
    const tag = f.id ?? `findings[${i}]`;
    if (f.id) {
      if (ids.has(f.id)) errors.push(`${tag}: duplicate id.`);
      ids.add(f.id);
    }
    if (!f.title?.trim()) errors.push(`${tag}: missing title.`);
    if (!SEVERITIES.includes(f.severity)) errors.push(`${tag}: severity must be critical, important or minor.`);
    if (!SURFACES.includes(f.surface)) errors.push(`${tag}: surface must be one of ${SURFACES.join(", ")}.`);
    if (!f.steps?.length) errors.push(`${tag}: no reproduction steps.`);
    if (!f.expected?.trim() || !f.actual?.trim()) errors.push(`${tag}: expected and actual are both required.`);
    if (!f.reproduced || f.reproduced.times < 2 || f.reproduced.of < f.reproduced.times) {
      errors.push(`${tag}: must be reproduced at least twice (move it to unconfirmed.json otherwise).`);
    }
    if (!f.evidence?.length) errors.push(`${tag}: no evidence (screenshot, sanitized request/response or console log).`);
    for (const e of f.evidence ?? []) {
      const abs = insideRun(runDir, e);
      if (!abs) errors.push(`${tag}: evidence path "${e}" is outside the run folder.`);
      else if (!fs8.existsSync(abs)) errors.push(`${tag}: evidence file "${e}" does not exist.`);
    }
    if (!f.regression_test) warnings.push(`${tag}: no regression test proposed.`);
  }
  for (const n of data.notTested) if (!n.area?.trim() || !n.reason?.trim()) errors.push("not-tested.json: every entry needs an area and a reason.");
  for (const row of data.coverage) {
    if (row.status === "tested" && /not tested|blocked|skipped/i.test(row.note ?? "")) errors.push(`coverage "${row.area}" is marked tested but its note says otherwise.`);
  }
  if (data.findings.length === 0 && data.coverage.length === 0) warnings.push("No findings and no coverage rows: the report would not show what was checked.");
  const scan = [path10.join(runDir, "TECHNICAL-REPORT.md")];
  for (const sub of ["evidence", "data"]) {
    const dir = path10.join(runDir, sub);
    if (!fs8.existsSync(dir)) continue;
    const walk = (d) => {
      for (const e of fs8.readdirSync(d, { withFileTypes: true })) {
        const p = path10.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(json|md|txt|log|yml|yaml|har|html)$/i.test(e.name)) scan.push(p);
      }
    };
    walk(dir);
  }
  for (const file of scan) {
    if (!fs8.existsSync(file)) continue;
    const isPlan = path10.relative(runDir, file).split(path10.sep).join("/").startsWith("data/plans/");
    const leaks = findSecretLeaks(fs8.readFileSync(file, "utf8"), knownSecrets, { generic: !isPlan });
    for (const leak of leaks) errors.push(`${path10.relative(runDir, file)}: contains ${leak}; redact it before reporting.`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

// core/lib/stack.ts
import fs9 from "node:fs";
import path11 from "node:path";
var JS_FRAMEWORKS = [
  ["next", "nextjs"],
  ["react", "react"],
  ["vue", "vue"],
  ["nuxt", "nuxt"],
  ["@angular/core", "angular"],
  ["svelte", "svelte"],
  ["express", "express"],
  ["fastify", "fastify"],
  ["@nestjs/core", "nestjs"],
  ["koa", "koa"],
  ["hono", "hono"]
];
var JS_TEST_RUNNERS = [
  ["vitest", "vitest"],
  ["jest", "jest"],
  ["mocha", "mocha"],
  ["@playwright/test", "playwright-test"],
  ["cypress", "cypress"],
  ["ava", "ava"]
];
function readIf(file) {
  try {
    return fs9.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}
function detectStack(root, now = /* @__PURE__ */ new Date()) {
  const frameworks = /* @__PURE__ */ new Set();
  const languages = /* @__PURE__ */ new Set();
  const runners = /* @__PURE__ */ new Set();
  const commands = {};
  let packageManager;
  const pkg = readJson(path11.join(root, "package.json"));
  if (pkg) {
    languages.add("javascript");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [dep, name] of JS_FRAMEWORKS) if (deps[dep]) frameworks.add(name);
    for (const [dep, name] of JS_TEST_RUNNERS) if (deps[dep]) runners.add(name);
    if (deps["typescript"] || exists(path11.join(root, "tsconfig.json"))) languages.add("typescript");
    packageManager = exists(path11.join(root, "pnpm-lock.yaml")) ? "pnpm" : exists(path11.join(root, "yarn.lock")) ? "yarn" : exists(path11.join(root, "bun.lock")) ? "bun" : "npm";
    const run = packageManager === "npm" ? "npm run" : packageManager;
    if (pkg.scripts?.["test"] && !/no test specified/.test(pkg.scripts["test"])) {
      commands.test = packageManager === "npm" ? "npm test" : `${packageManager} test`;
      if (/node\s+(--\S+\s+)*--test|node:test/.test(pkg.scripts["test"])) runners.add("node:test");
    }
    if (pkg.scripts?.["build"]) commands.build = `${run} build`;
    if (pkg.scripts?.["dev"]) commands.dev = `${run} dev`;
    else if (pkg.scripts?.["start"]) commands.dev = packageManager === "npm" ? "npm start" : `${packageManager} start`;
  }
  const composer = readIf(path11.join(root, "composer.json"));
  if (composer) {
    languages.add("php");
    if (/laravel\/framework/.test(composer)) frameworks.add("laravel");
    if (/phpunit/.test(composer)) runners.add("phpunit");
    if (/pestphp/.test(composer)) runners.add("pest");
    packageManager ??= "composer";
  }
  const py = readIf(path11.join(root, "requirements.txt")) + readIf(path11.join(root, "pyproject.toml"));
  if (py || exists(path11.join(root, "manage.py"))) {
    languages.add("python");
    if (/django/i.test(py) || exists(path11.join(root, "manage.py"))) frameworks.add("django");
    if (/fastapi/i.test(py)) frameworks.add("fastapi");
    if (/flask/i.test(py)) frameworks.add("flask");
    if (/pytest/i.test(py)) runners.add("pytest");
    packageManager ??= "pip";
  }
  if (/rails/.test(readIf(path11.join(root, "Gemfile")))) {
    languages.add("ruby");
    frameworks.add("rails");
    if (/rspec/.test(readIf(path11.join(root, "Gemfile")))) runners.add("rspec");
    packageManager ??= "bundler";
  }
  try {
    if (fs9.readdirSync(root).some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) {
      languages.add("csharp");
      frameworks.add("dotnet");
      commands.test ??= "dotnet test";
      packageManager ??= "nuget";
    }
  } catch {
  }
  return {
    schema_version: SCHEMA_VERSION,
    frameworks: [...frameworks].sort(),
    languages: [...languages].sort(),
    test_runners: [...runners].sort(),
    ...packageManager ? { package_manager: packageManager } : {},
    commands,
    detected_at: now.toISOString()
  };
}
function saveStack(memoryDir, stack) {
  const file = path11.join(memoryDir, "stack.json");
  const prev = readJson(file);
  const strip = (s) => JSON.stringify({ ...s, detected_at: void 0 });
  if (prev && strip(prev) === strip(stack)) return { changed: false };
  writeJson(file, stack);
  return { changed: true };
}

// core/lib/version.ts
var QAMIND_VERSION = true ? "0.1.0" : "dev";
var KNOWLEDGE_VERSION = true ? "0.1.1" : "dev";

// core/lib/run.ts
var MODES = ["full", "quick", "regression", "diff"];
var MARKER_TTL_HOURS = 8;
function realOrResolved(p) {
  try {
    return fs10.realpathSync(p);
  } catch {
    return path12.resolve(p);
  }
}
function browserStatus(home, projectRoot, expectedNames) {
  const state = readJson(path12.join(home, "state", "browser-state.json"));
  const key = Object.keys(state ?? {}).find((k) => realOrResolved(k) === realOrResolved(projectRoot));
  if (!state || !key) {
    return {
      status: "not-seen",
      message: "The browser tool has not been started for this project folder (it starts with the session, in the folder the agent was opened in). UI testing needs it: start the agent from the project folder."
    };
  }
  const have = new Set(state[key]?.secret_names ?? []);
  const missing = expectedNames.filter((n) => !have.has(n));
  if (missing.length > 0) {
    return {
      status: "restart-needed",
      message: "The browser tool started before these test credentials were available, so it cannot sign in with them. Restart the session (or reload plugins) so it picks them up.",
      missing
    };
  }
  return { status: "ok", message: "The browser tool has the test credentials." };
}
function copyIfMissing(from, to, created) {
  if (exists(to)) return;
  ensureDir(path12.dirname(to));
  fs10.copyFileSync(from, to);
  created.push(to);
}
function markerPath(store) {
  return path12.join(storeSubdirs(store).state, RUN_MARKER_FILE);
}
function readMarker(store) {
  return readJson(markerPath(store));
}
function isExpired(marker, now = /* @__PURE__ */ new Date()) {
  return new Date(marker.expires).getTime() <= now.getTime();
}
function findActiveMarkers(home, now = /* @__PURE__ */ new Date()) {
  const root = projectsRoot(home);
  if (!exists(root)) return [];
  const out = [];
  for (const entry of fs10.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = readJson(path12.join(root, entry.name, "state", RUN_MARKER_FILE));
    if (m && !isExpired(m, now)) out.push(m);
  }
  return out;
}
function findMarkerByRunId(home, runId) {
  return scanAllMarkers(home).find((m) => m.run_id === runId);
}
function scanAllMarkers(home) {
  const root = projectsRoot(home);
  if (!exists(root)) return [];
  const out = [];
  for (const entry of fs10.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const m = readJson(path12.join(root, entry.name, "state", RUN_MARKER_FILE));
    if (m) out.push(m);
  }
  return out;
}
function startRun(opts2) {
  const env = opts2.env ?? process.env;
  const now = opts2.now ?? /* @__PURE__ */ new Date();
  const root = path12.resolve(opts2.project ?? opts2.cwd);
  if (!exists(root) || !fs10.statSync(root).isDirectory()) {
    return { status: "no-project", message: `The folder ${root} does not exist. Ask the user which project folder to test.`, known_projects: listKnownProjects(opts2.home) };
  }
  if (!opts2.project && !looksLikeProject(root)) {
    return {
      status: "no-project",
      message: "The current folder does not look like a project (no git repository, app code or .qa/config.md). Ask the user which project folder to test, offering the known projects below, then run again with --project <folder>.",
      known_projects: listKnownProjects(opts2.home)
    };
  }
  const info = resolveProject(root);
  const { store } = ensureProjectStore(opts2.home, info, now);
  const projectOut = { id: info.id, name: info.name, root: info.root, id_source: info.idSource, store };
  const configFile = path12.join(root, ".qa", "config.md");
  const gitignoreAdded = ensureGitignoreEntries(root);
  if (!exists(configFile)) {
    const created = [];
    const core = corePath();
    copyIfMissing(path12.join(core, "shared", "templates", "config.md"), configFile, created);
    copyIfMissing(path12.join(core, "shared", "templates", "env.qa.example"), path12.join(root, ".env.qa.example"), created);
    return {
      status: "needs-config",
      message: "First run in this project: QAMind created .qa/config.md and .env.qa.example and added .qa/ and .env.qa to .gitignore. Fill in .qa/config.md (every REPLACE_ME), copy .env.qa.example to .env.qa and add the TEST account logins, then run QA again. Nothing was tested.",
      project: projectOut,
      created,
      gitignore_added: gitignoreAdded
    };
  }
  const check = checkConfigFile(root, env);
  if (check.status !== "ok" || !check.config) {
    const status = check.status === "ok" ? "invalid" : check.status;
    const message = {
      unfilled: "The config is still the unfilled template. Fill in the REPLACE_ME values, then run again. Nothing was tested.",
      invalid: "The config has problems. Fix them, then run again. Nothing was tested.",
      "blocked-url": "A configured URL is blocked as production. QAMind never tests production. Fix the URL or the blocked patterns. Nothing was tested.",
      "ambiguous-url": "A configured URL does not look like a test environment. Ask the user to confirm it is NOT production; if they confirm, set environment.confirmed_non_production: true in .qa/config.md and run again. Nothing was tested."
    };
    return {
      status,
      message: message[check.status] ?? "The config could not be used.",
      project: projectOut,
      problems: check.problems,
      blocked: check.blocked,
      ambiguous: check.ambiguous
    };
  }
  const config = check.config;
  const credNames = config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(root, env, credNames);
  const roles = config.roles.map((r) => ({ name: r.name, ui: r.ui, ...r.tenant ? { tenant: r.tenant } : {}, has_credentials: !!values[r.username_env] && !!values[r.password_env] }));
  if (!roles.some((r) => r.has_credentials)) {
    return {
      status: "missing-env",
      message: "No test account has both its username and password set. Add them to .env.qa (names below) and run again. Values are never printed.",
      project: projectOut,
      missing_env: check.missing_env
    };
  }
  const existing = readMarker(store);
  if (existing && !isExpired(existing, now) && !opts2.force) {
    const sameSession = !!opts2.sessionId && existing.session_id === opts2.sessionId;
    if (!sameSession) {
      return {
        status: "busy",
        message: `Another QA run (${existing.run_id}) is still active for this project. Finish it, or run again with --force if it was abandoned.`,
        project: projectOut,
        active_run: { run_id: existing.run_id, started: existing.started }
      };
    }
  }
  let runId = `run-${utcStamp(now)}`;
  const reports = path12.join(root, ".qa", "reports");
  for (let n = 2; exists(path12.join(reports, runId)); n++) runId = `run-${utcStamp(now)}-${n}`;
  const runDir = path12.join(reports, runId);
  for (const sub of ["screenshots", "evidence", "data"]) ensureDir(path12.join(runDir, sub));
  const stack = detectStack(root, now);
  saveStack(storeSubdirs(store).memory, stack);
  const git2 = gitInfo(root);
  const policy = policyFromConfig(config);
  const readonly = opts2.kind === "qa-only" || opts2.trigger === "ci";
  const trigger = opts2.trigger ?? "manual";
  const marker = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: info.id,
    project_root: info.root,
    store,
    run_dir: runDir,
    mode: opts2.mode,
    kind: opts2.kind,
    readonly,
    trigger,
    host: opts2.host,
    ...opts2.sessionId ? { session_id: opts2.sessionId } : {},
    ...opts2.focus ? { focus: opts2.focus } : {},
    started: now.toISOString(),
    expires: new Date(now.getTime() + MARKER_TTL_HOURS * 36e5).toISOString(),
    policy
  };
  writeJson(markerPath(store), marker);
  const meta = {
    schema_version: SCHEMA_VERSION,
    run_id: runId,
    project_id: info.id,
    project_name: info.name,
    environment: config.environment.name,
    mode: opts2.mode,
    trigger,
    kind: opts2.kind,
    host: opts2.host,
    ...opts2.focus ? { focus: opts2.focus } : {},
    started: now.toISOString(),
    ...git2.branch ? { branch: git2.branch } : {},
    ...git2.commit ? { commit: git2.commit } : {},
    agent_version: QAMIND_VERSION,
    knowledge_version: KNOWLEDGE_VERSION
  };
  writeJson(path12.join(runDir, "data", "meta.json"), meta);
  return {
    status: "ready",
    message: "Ready. Credentials are present for the roles listed (values are never shown).",
    project: projectOut,
    gitignore_added: gitignoreAdded,
    run: { id: runId, dir: runDir, mode: opts2.mode, ...opts2.focus ? { focus: opts2.focus } : {}, readonly, report: path12.join(runDir, "TECHNICAL-REPORT.md") },
    config: {
      environment: config.environment.name,
      web_uis: config.web_uis,
      api: { ...config.api.base_url ? { base_url: config.api.base_url } : {}, ...config.api.openapi ? { openapi: config.api.openapi } : {}, login_configured: !!config.api.login },
      roles,
      test_data_prefix: config.test_data_prefix,
      fix_severities: config.fix_policy.fix_severities
    },
    ...check.missing_env.length ? { missing_env: check.missing_env } : {},
    ...check.advisories.length ? { advisories: check.advisories } : {},
    stack,
    git: git2,
    policy,
    browser: browserStatus(opts2.home, root, credNames.filter((n) => !!values[n]))
  };
}
function finishRun(opts2) {
  const marker = findMarkerByRunId(opts2.home, opts2.runId);
  if (!marker) throw new Error(`No run ${opts2.runId} found in the user store (already finished, or wrong id).`);
  const now = opts2.now ?? /* @__PURE__ */ new Date();
  const data = readRunData(marker.run_dir);
  assignIds(marker.run_dir, data);
  const counts = countBySeverity(data.findings);
  const notTested = mergedNotTested(data);
  const started = new Date(marker.started).getTime();
  const duration_s = Math.max(0, Math.round((now.getTime() - started) / 1e3));
  const meta = readJson(path12.join(marker.run_dir, "data", "meta.json"));
  const stop_reason = opts2.stopReason ?? "completed";
  const summary = {
    schema_version: SCHEMA_VERSION,
    run_id: marker.run_id,
    mode: marker.mode,
    trigger: marker.trigger,
    kind: marker.kind,
    host: marker.host,
    started: marker.started,
    finished: now.toISOString(),
    duration_s,
    counts: { ...counts, unconfirmed: data.unconfirmed.length },
    finding_ids: data.findings.map((f) => f.id ?? "").filter(Boolean),
    coverage: {
      tested: data.coverage.filter((c) => c.status === "tested").length,
      partial: data.coverage.filter((c) => c.status === "partial").length,
      not_tested: data.coverage.filter((c) => c.status === "not-tested").length
    },
    not_tested_count: notTested.length,
    blocked_areas: notTested.map((n) => n.area),
    cost: opts2.cost ?? "not available on this host",
    stop_reason,
    agent_version: QAMIND_VERSION,
    knowledge_version: KNOWLEDGE_VERSION,
    ...meta?.branch ? { branch: meta.branch } : {},
    ...meta?.commit ? { commit: meta.commit } : {},
    report: path12.join(marker.run_dir, "TECHNICAL-REPORT.md")
  };
  writeJson(path12.join(storeSubdirs(marker.store).runs, `${marker.run_id}.json`), summary);
  if (meta) writeJson(path12.join(marker.run_dir, "data", "meta.json"), { ...meta, finished: summary.finished, duration_s, stop_reason, cost: summary.cost });
  fs10.writeFileSync(path12.join(marker.run_dir, "TECHNICAL-REPORT.md"), renderTechnicalReport(readRunData(marker.run_dir)), "utf8");
  fs10.rmSync(markerPath(marker.store), { force: true });
  return summary;
}

// core/lib/guardpolicy.ts
var BROWSER_INTERNAL = /^(update\.googleapis\.com|accounts\.google\.com|content-autofill\.googleapis\.com|optimizationguide-pa\.googleapis\.com|safebrowsing\.googleapis\.com|clients\d?\.google\.com|clientservices\.googleapis\.com|www\.google\.com|www\.gstatic\.com|edgedl\.me\.gvt1\.com|redirector\.gvt1\.com|android\.clients\.google\.com)$/i;
function mergedPolicy(markers) {
  return {
    allowed_origins: [...new Set(markers.flatMap((m) => m.policy.allowed_origins))],
    blocked_patterns: [...new Set(markers.flatMap((m) => m.policy.blocked_patterns))]
  };
}
function decide(url, markers) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
  }
  const internal = BROWSER_INTERNAL.test(host);
  if (markers.length === 0) return { allowed: false, reason: "no QAMind run is active, so the test browser is locked", internal };
  const r = isRequestAllowed(mergedPolicy(markers), url);
  return { allowed: r.allowed, reason: r.reason, internal };
}
function logBlocked(home, markers, entry) {
  const targets = markers.length ? markers.map((m) => ({ file: path13.join(m.store, "state", "guard-blocked.jsonl"), run_id: m.run_id })) : [{ file: path13.join(home, "state", "guard-blocked.jsonl"), run_id: "none" }];
  for (const t of targets) {
    try {
      ensureDir(path13.dirname(t.file));
      fs11.appendFileSync(t.file, JSON.stringify({ ts: (/* @__PURE__ */ new Date()).toISOString(), run_id: t.run_id, ...entry }) + "\n", "utf8");
    } catch {
    }
  }
}
function readBlocked(store, runId) {
  const file = path13.join(store, "state", "guard-blocked.jsonl");
  if (!fs11.existsSync(file)) return [];
  return fs11.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.run_id === runId);
}
function markerSource(home, ttlMs = 1e3) {
  let at = 0;
  let cached = [];
  return () => {
    const now = Date.now();
    if (now - at > ttlMs) {
      cached = findActiveMarkers(home);
      at = now;
    }
    return cached;
  };
}

// core/lib/health.ts
async function runHealthCheck(args) {
  const doFetch = args.fetchImpl ?? fetch;
  const timeoutMs = args.timeoutMs ?? 15e3;
  const checks = [];
  const probeUrl = async (name, url, okBelow) => {
    const allowed = isRequestAllowed(args.policy, url);
    if (!allowed.allowed) {
      checks.push({ name, ok: false, detail: `blocked by the production-safety policy: ${allowed.reason}` });
      return;
    }
    const start = Date.now();
    try {
      const res = await doFetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      const ms = Date.now() - start;
      const location = res.headers.get("location");
      if (location && res.status >= 300 && res.status < 400 && !isRequestAllowed(args.policy, new URL(location, url).toString()).allowed) {
        checks.push({ name, ok: false, detail: `redirects to ${new URL(location, url).origin}, which is not an allowed test origin`, ms });
        return;
      }
      checks.push({ name, ok: res.status < okBelow, detail: `HTTP ${res.status}`, ms });
    } catch (err) {
      checks.push({ name, ok: false, detail: `no response: ${err.message}`, ms: Date.now() - start });
    }
  };
  for (const ui of args.config.web_uis) await probeUrl(`Web UI "${ui.name}" loads`, ui.url, 400);
  const base = args.config.api.base_url;
  if (base) await probeUrl("API base responds", base, 500);
  for (const p of args.config.health.checks) {
    const url = base ? joinUrl(base, p) : p;
    await probeUrl(`Health check ${p}`, url, 400);
  }
  for (const role of args.config.roles) {
    const name = `Test account "${role.name}" can sign in`;
    const creds = args.roles.find((r) => r.name === role.name);
    if (!creds) {
      checks.push({ name, ok: true, skipped: true, detail: "no credentials in .env.qa, so this role will be reported as Not tested" });
    } else if (!base || !args.config.api.login) {
      checks.push({ name, ok: true, skipped: true, detail: "API login is not configured; sign-in is exercised during UI testing" });
    } else {
      const start = Date.now();
      const session = await loginRole({ role: role.name, creds, login: args.config.api.login, baseUrl: base, policy: args.policy, timeoutMs, fetchImpl: doFetch });
      checks.push({ name, ok: !session.failure, detail: session.failure ?? "signed in over the API", ms: Date.now() - start });
    }
  }
  return { environment_ok: checks.every((c) => c.ok || c.skipped), checks, ran_at: (/* @__PURE__ */ new Date()).toISOString() };
}

// core/lib/hooks.ts
import path14 from "node:path";
var GIT_MUTATION = /\bgit\s+(?:-[A-Za-z]\s+\S+\s+)*(add|commit|push|pull|fetch\s+--prune|merge|rebase|reset|checkout|switch|restore|stash|cherry-pick|revert|rm|mv|clean|tag|apply|am|worktree|branch\s+-[dDmM])\b/;
var INSTALLS = /\b(npm|pnpm|yarn|bun)\s+(install|i|add|remove|uninstall|update|upgrade|ci)\b|\bpip3?\s+install\b|\bcomposer\s+(install|require|update|remove)\b|\bbundle\s+(install|update)\b|\bdotnet\s+add\b/;
var IN_PLACE_EDIT = /\bsed\s+(?:-[A-Za-z]*i|--in-place)\b|\bperl\s+-[A-Za-z]*i\b/;
var REDIRECT = /(?:^|[^0-9&>=<-])>{1,2}(?![=>&|])\s*([^\s&|;)]+)/g;
var AMP_REDIRECT = /&>{1,2}\s*([^\s&|;)]+)/g;
var stripQuoted = (cmd) => cmd.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, '""');
var CREDENTIAL_FILE = /(^|[\\/\s"'=])\.env\.qa(?![.\w-])/;
function inside(child, parent) {
  const rel = path14.relative(parent, child);
  return rel === "" || !rel.startsWith("..") && !path14.isAbsolute(rel);
}
function allowedWriteRoots(marker, home, tmpDirs) {
  return [path14.join(marker.project_root, ".qa"), home, ...tmpDirs];
}
function decidePreToolUse(input, home, tmpDirs = [], now = /* @__PURE__ */ new Date()) {
  if (!input.session_id) return null;
  const marker = findActiveMarkers(home, now).find((m) => m.session_id === input.session_id);
  if (!marker) return null;
  const tool = input.tool_name ?? "";
  const ti = input.tool_input ?? {};
  const cwd = input.cwd ?? marker.project_root;
  const abs = (p) => path14.resolve(cwd, p);
  if (tool === "Read" || tool === "Grep" || tool === "Glob") {
    const target = String(ti["file_path"] ?? ti["path"] ?? ti["pattern"] ?? "");
    if (CREDENTIAL_FILE.test(`/${target}`) || path14.basename(target) === ".env.qa") {
      return { decision: "deny", reason: "QAMind never reads .env.qa: credentials must not enter the conversation. Use the secret names in the roles table (the browser tool and the qamind CLI substitute the values)." };
    }
  }
  if (tool === "mcp__plugin_qamind_browser__browser_run_code_unsafe") {
    return { decision: "deny", reason: "browser_run_code_unsafe runs arbitrary code in the browser tool's process, which holds the test credentials. Use the regular browser tools instead." };
  }
  if (tool === "Bash") {
    const cmd = String(ti["command"] ?? "");
    if (CREDENTIAL_FILE.test(cmd) && !/\.env\.qa\.example/.test(cmd.replace(/\.env\.qa(?!\.example)/g, "X.env.qa"))) {
      return { decision: "deny", reason: "Commands that touch .env.qa are blocked during a QAMind run: credentials must never be printed or copied." };
    }
    if (/^\s*(printenv|env|export\s+-p|set)\s*(\||$)/.test(cmd)) return { decision: "deny", reason: "Dumping the environment could print test credentials, so it is blocked during a QAMind run." };
  }
  if (!marker.readonly) return null;
  const roots = allowedWriteRoots(marker, home, tmpDirs);
  const writable = (p) => roots.some((r) => inside(abs(p), r));
  if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
    const target = String(ti["file_path"] ?? ti["notebook_path"] ?? "");
    if (target && !writable(target)) {
      return { decision: "deny", reason: `This is a report-only QA run (${marker.kind}): it may write only inside .qa/ and the QAMind user store, not ${target}. Put the proposal in the report instead.` };
    }
  }
  if (tool === "Bash") {
    const cmd = String(ti["command"] ?? "");
    const reportOnly = `This is a report-only QA run (${marker.kind}), so this command is blocked`;
    if (GIT_MUTATION.test(cmd)) return { decision: "deny", reason: `${reportOnly}: it would change git state.` };
    if (INSTALLS.test(cmd)) return { decision: "deny", reason: `${reportOnly}: it would change dependencies.` };
    if (IN_PLACE_EDIT.test(cmd)) return { decision: "deny", reason: `${reportOnly}: it edits files in place.` };
    const unquoted = stripQuoted(cmd);
    for (const m of [...unquoted.matchAll(REDIRECT), ...unquoted.matchAll(AMP_REDIRECT)]) {
      const raw = (m[1] ?? "").replace(/^["']|["']$/g, "");
      if (!raw || raw === "/dev/null" || raw.startsWith("&") || raw === "/dev/stderr" || raw === "/dev/stdout") continue;
      if (!writable(raw)) return { decision: "deny", reason: `${reportOnly}: it writes to ${raw}, outside .qa/ and the QAMind user store.` };
    }
  }
  return null;
}
function toHookOutput(d) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: d.decision, permissionDecisionReason: d.reason } };
}

// core/lib/memory.ts
import fs12 from "node:fs";
import path15 from "node:path";
function loadMemoryContext(store, limit = 3) {
  const dirs = storeSubdirs(store);
  const stack = readJson(path15.join(dirs.memory, "stack.json"));
  const runs = [];
  if (fs12.existsSync(dirs.runs)) {
    const files = fs12.readdirSync(dirs.runs).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    for (const f of files) {
      const r = readJson(path15.join(dirs.runs, f));
      if (r) runs.push({ run_id: r.run_id, mode: r.mode, finished: r.finished, counts: r.counts, not_tested_count: r.not_tested_count, finding_ids: r.finding_ids, stop_reason: r.stop_reason });
    }
  }
  return {
    note: runs.length === 0 ? "No previous runs for this project: treat this as a first run." : `${runs.length} previous run(s) found. Memory is leads, not proof: re-verify current behaviour.`,
    ...stack ? { stack } : {},
    last_runs: runs
  };
}

// core/lib/runctx.ts
import path16 from "node:path";
function loadRunContext(home, runId, env = process.env) {
  if (!runId) throw new Error("--run <run-id> is required (use the id printed by `run start`).");
  const marker = findMarkerByRunId(home, runId);
  if (!marker) throw new Error(`No run "${runId}" found in the QAMind user store. It may have finished, or the id is wrong.`);
  const check = checkConfigFile(marker.project_root, env);
  if (!check.config) throw new Error(`The config for run ${runId} is no longer usable: ${check.problems.join(" ")}`);
  const names = check.config.roles.flatMap((r) => [r.username_env, r.password_env]);
  const { values } = loadQaEnv(marker.project_root, env, names);
  const roles = [];
  for (const r of check.config.roles) {
    const username = values[r.username_env];
    const password = values[r.password_env];
    if (username && password) roles.push({ name: r.name, username, password });
  }
  return {
    marker,
    projectRoot: marker.project_root,
    runDir: path16.resolve(marker.run_dir),
    config: check.config,
    policy: marker.policy,
    roles,
    passwords: roles.map((r) => r.password)
  };
}

// core/scripts/browser-launcher.ts
import { spawn } from "node:child_process";
import fs13 from "node:fs";
import os2 from "node:os";
import path17 from "node:path";
import { createRequire } from "node:module";

// core/scripts/guard-proxy.ts
import http from "node:http";
import net from "node:net";
function startGuardProxy(home, port = 0) {
  const markers = markerSource(home);
  const deny = (method, url, reason, internal) => {
    if (!internal) logBlocked(home, markers(), { method, url, reason });
  };
  const server = http.createServer((req, res) => {
    const url = req.url ?? "";
    let target;
    try {
      target = new URL(url);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" }).end("QAMind guard: proxy requests need an absolute URL");
      return;
    }
    const d = decide(url, markers());
    if (!d.allowed) {
      deny(req.method ?? "GET", url, d.reason, d.internal);
      res.writeHead(403, { "content-type": "text/plain", "x-qamind-guard": "blocked" }).end(`QAMind guard blocked ${target.origin}: ${d.reason}`);
      return;
    }
    const headers = { ...req.headers };
    delete headers["proxy-connection"];
    const upstream = http.request({ host: target.hostname, port: target.port || 80, path: `${target.pathname}${target.search}`, method: req.method, headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  server.on("connect", (req, clientSocket, head) => {
    const hostPort = req.url ?? "";
    const [host = "", p = "443"] = hostPort.split(":");
    const d = decide(`https://${hostPort}`, markers());
    if (!d.allowed) {
      deny("CONNECT", `https://${hostPort}`, d.reason, d.internal);
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect(Number(p) || 443, host, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });
  server.on("upgrade", (req, clientSocket, head) => {
    const url = req.url ?? "";
    let target;
    try {
      target = new URL(url);
    } catch {
      clientSocket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const d = decide(url, markers());
    if (!d.allowed) {
      deny("UPGRADE", url, d.reason, d.internal);
      clientSocket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const upstream = net.connect(Number(target.port) || 80, target.hostname, () => {
      const lines = [`${req.method} ${target.pathname}${target.search} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upstream.write(`${lines.join("\r\n")}\r
\r
`);
      upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ port: addr.port, close: () => new Promise((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      }) });
    });
  });
}

// core/scripts/browser-launcher.ts
var PLAYWRIGHT_MCP_VERSION = "0.0.83";
function detectChromeChannel() {
  const exists2 = (p) => fs13.existsSync(p);
  const onPath = (name) => (process.env["PATH"] ?? "").split(path17.delimiter).some((d) => d && exists2(path17.join(d, name)));
  if (process.platform === "darwin") {
    if (exists2("/Applications/Google Chrome.app")) return "chrome";
    if (exists2("/Applications/Microsoft Edge.app")) return "msedge";
  } else if (process.platform === "win32") {
    const roots = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env["LOCALAPPDATA"]].filter((x) => !!x);
    if (roots.some((r) => exists2(path17.join(r, "Google", "Chrome", "Application", "chrome.exe")))) return "chrome";
    if (roots.some((r) => exists2(path17.join(r, "Microsoft", "Edge", "Application", "msedge.exe")))) return "msedge";
  } else {
    if (["google-chrome", "google-chrome-stable"].some(onPath)) return "chrome";
    if (onPath("microsoft-edge")) return "msedge";
  }
  return void 0;
}
function resolvePlaywrightMcp() {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req.resolve("@playwright/mcp/package.json");
    return { command: process.execPath, args: [path17.join(path17.dirname(pkg), "cli.js")] };
  } catch {
    return { command: process.platform === "win32" ? "npx.cmd" : "npx", args: ["--yes", `@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}`] };
  }
}
async function runBrowserLauncher() {
  const home = qamindHome();
  const projectRoot = fs13.realpathSync(path17.resolve(process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd()));
  const guard = await startGuardProxy(home);
  const secrets = {};
  const envFile = path17.join(projectRoot, ".env.qa");
  if (fs13.existsSync(envFile)) Object.assign(secrets, parseDotenv(fs13.readFileSync(envFile, "utf8")));
  try {
    if (fs13.existsSync(path17.join(projectRoot, ".qa", "config.md"))) {
      const cfg = checkConfigFile(projectRoot).config;
      for (const r of cfg?.roles ?? []) for (const n of [r.username_env, r.password_env]) if (process.env[n]) secrets[n] = process.env[n];
    }
  } catch {
  }
  const tmp = fs13.mkdtempSync(path17.join(os2.tmpdir(), "qamind-browser-"));
  fs13.chmodSync(tmp, 448);
  const secretsFile = path17.join(tmp, "secrets.env");
  fs13.writeFileSync(secretsFile, Object.entries(secrets).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join("\n") + "\n", { mode: 384 });
  const outDir = path17.join(tmp, "output");
  ensureDir(outDir);
  const stateFile = path17.join(home, "state", "browser-state.json");
  const state = readJson(stateFile) ?? {};
  state[projectRoot] = { secret_names: Object.keys(secrets).sort(), proxy_port: guard.port, pid: process.pid, started: (/* @__PURE__ */ new Date()).toISOString() };
  writeJson(stateFile, state);
  const auditScript = (() => {
    try {
      const f = path17.join(corePath(), "shared", "page-audit.js");
      return fs13.existsSync(f) ? f : void 0;
    } catch {
      return void 0;
    }
  })();
  const channel = process.env["QAMIND_BROWSER_CHANNEL"] ?? detectChromeChannel();
  const mcp = resolvePlaywrightMcp();
  const args = [
    ...mcp.args,
    ...process.env["QAMIND_BROWSER_HEADED"] === "1" ? [] : ["--headless"],
    "--isolated",
    ...channel && channel !== "chromium" ? ["--browser", channel] : [],
    "--proxy-server",
    `http://127.0.0.1:${guard.port}`,
    "--secrets",
    secretsFile,
    "--output-dir",
    outDir,
    "--block-service-workers",
    ...auditScript ? ["--init-script", auditScript] : [],
    "--viewport-size",
    "1366x768",
    ...process.env["QAMIND_BROWSER_IGNORE_HTTPS_ERRORS"] === "1" ? ["--ignore-https-errors"] : []
  ];
  if (!channel) process.stderr.write("[qamind] No system Chrome/Edge found; using Playwright's bundled Chromium. If the browser fails to start, run: npx playwright-core install chromium\n");
  const child = spawn(mcp.command, args, { stdio: "inherit", cwd: projectRoot });
  const cleanup = async () => {
    await guard.close().catch(() => void 0);
    fs13.rmSync(tmp, { recursive: true, force: true });
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
  return new Promise((resolve) => {
    child.on("exit", async (code, signal) => {
      await cleanup();
      resolve(code ?? (signal ? 1 : 0));
    });
    child.on("error", async (err) => {
      process.stderr.write(`[qamind] Could not start the browser tool: ${err.message}
`);
      await cleanup();
      resolve(1);
    });
  });
}

// cli/src/main.ts
function emit(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
var UsageError = class extends Error {
};
var HELP = `qamind ${QAMIND_VERSION}: Senior QA Engineer agent runtime

Run lifecycle
  run start   [--mode full|quick|regression|diff] [--focus TEXT] [--session ID] [--project DIR]
              [--kind qa-only|qa] [--trigger manual|auto|ci] [--host NAME] [--force]
  run finish  --run ID [--stop-reason TEXT] [--cost TEXT]
Checks and testing
  config check [--project DIR]
  health       --run ID
  api inventory --run ID [--spec PATH_OR_URL]
  api plan      --run ID [--role NAME] [--name NAME] [--no-writes] [--no-matrix] [--include-side-effects]
                [--max-per-endpoint N] [--max-total N]
  api run       --run ID --plan FILE_OR_NAME [--read-only] [--slow-ms N]
Reporting and memory
  report build --run ID        render TECHNICAL-REPORT.md from <run>/data/*.json
  report lint  --run ID        enforce the evidence rules (exit 1 on errors)
  memory context --run ID      stack and recent runs for this project
  memory where [--project DIR] print the project's private store path
  guard log    --run ID        origins the browser guard blocked during the run
Plumbing (started by the host, not by hand)
  browser-mcp                  browser tool behind the production guard
  hook pre-tool-use            safety hook (reads the host's hook JSON on stdin)
  version
`;
function opts(args, options) {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true });
  } catch (err) {
    throw new UsageError(err.message);
  }
}
function num(v, name, fallback) {
  if (v === void 0) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${name} must be a positive number`);
  return n;
}
async function cmdRun(sub, rest, home) {
  if (sub === "start") {
    const { values } = opts(rest, {
      mode: { type: "string", default: "full" },
      focus: { type: "string" },
      session: { type: "string" },
      project: { type: "string" },
      kind: { type: "string", default: "qa-only" },
      trigger: { type: "string", default: "manual" },
      host: { type: "string", default: "claude-code" },
      force: { type: "boolean", default: false }
    });
    const mode = values.mode;
    if (!MODES.includes(mode)) throw new UsageError(`--mode must be one of ${MODES.join(", ")}`);
    if (values.kind !== "qa-only" && values.kind !== "qa") throw new UsageError("--kind must be qa-only or qa");
    if (!["manual", "auto", "ci"].includes(values.trigger)) throw new UsageError("--trigger must be manual, auto or ci");
    const result = startRun({
      cwd: process.cwd(),
      mode,
      kind: values.kind,
      trigger: values.trigger,
      host: values.host,
      home,
      force: values.force,
      ...values.project ? { project: values.project } : {},
      ...values.focus ? { focus: values.focus } : {},
      ...values.session ? { sessionId: values.session } : {}
    });
    emit(result);
    return result.status === "ready" ? 0 : result.status === "needs-config" ? 3 : result.status === "no-project" ? 5 : result.status === "busy" ? 6 : 4;
  }
  if (sub === "finish") {
    const { values } = opts(rest, { run: { type: "string" }, "stop-reason": { type: "string" }, cost: { type: "string" } });
    if (!values.run) throw new UsageError("--run is required");
    const summary = finishRun({ home, runId: values.run, ...values["stop-reason"] ? { stopReason: values["stop-reason"] } : {}, ...values.cost ? { cost: values.cost } : {} });
    emit(summary);
    return 0;
  }
  throw new UsageError("run needs a subcommand: start | finish");
}
async function loadInventory(ctx, specArg) {
  const source = specArg ?? ctx.config.api.openapi;
  if (!source) throw new UsageError("No OpenAPI source: set api.openapi in .qa/config.md or pass --spec. Without a spec, read the routes from the source code and the browser's network traffic.");
  let doc;
  if (/^https?:\/\//i.test(source)) {
    const allowed = isRequestAllowed(ctx.policy, source);
    if (!allowed.allowed) throw new Error(`Refusing to fetch the spec: ${allowed.reason}`);
    const res = await fetch(source, { redirect: "manual", signal: AbortSignal.timeout(2e4) });
    if (!res.ok) throw new Error(`Could not download the spec from ${source}: HTTP ${res.status}`);
    doc = parseSpecText(await res.text(), source);
  } else {
    doc = loadSpecFile(resolveSpecPath(source, ctx.projectRoot));
  }
  const inv = buildInventory(doc, source);
  writeJson(path18.join(ctx.runDir, "data", "api-inventory.json"), inv);
  return inv;
}
function readInventory(ctx) {
  return readJson(path18.join(ctx.runDir, "data", "api-inventory.json"));
}
async function cmdApi(sub, rest, home) {
  if (sub === "inventory") {
    const { values } = opts(rest, { run: { type: "string" }, spec: { type: "string" } });
    const ctx = loadRunContext(home, values.run);
    const inv = await loadInventory(ctx, values.spec);
    emit({
      source: inv.source,
      title: inv.title,
      version: inv.version,
      servers: inv.servers,
      security_schemes: inv.security_schemes,
      inventory_file: "data/api-inventory.json",
      count: inv.endpoints.length,
      endpoints: inv.endpoints.slice(0, 300).map((e) => ({
        operation: e.operation,
        auth: e.auth,
        ...e.summary ? { summary: e.summary } : {},
        params: e.parameters.map((p) => `${p.name}${p.required ? "*" : ""}(${p.in})`),
        ...e.request_body?.schema ? { body: Object.keys(e.request_body.schema["properties"] ?? {}) } : {},
        responses: e.responses.map((r) => r.status)
      }))
    });
    return 0;
  }
  if (sub === "plan") {
    const { values } = opts(rest, { run: { type: "string" }, role: { type: "string" }, name: { type: "string" }, "no-writes": { type: "boolean", default: false }, "max-per-endpoint": { type: "string" }, "max-total": { type: "string" }, "include-side-effects": { type: "boolean", default: false }, "no-matrix": { type: "boolean", default: false } });
    const ctx = loadRunContext(home, values.run);
    const inv = readInventory(ctx) ?? await loadInventory(ctx, void 0);
    const withCreds = ctx.roles.map((r) => r.name);
    const role = values.role ?? (withCreds.includes("admin") ? "admin" : withCreds[0]);
    if (!role) throw new UsageError("No role has credentials, so there is nobody to run the plan as.");
    const { plan, excluded } = generatePlan(inv, {
      sideEffects: values["include-side-effects"],
      matrix: !values["no-matrix"],
      role,
      matrixRoles: withCreds,
      prefix: ctx.config.test_data_prefix,
      writes: !values["no-writes"],
      maxPerEndpoint: num(values["max-per-endpoint"], "max-per-endpoint", 30),
      maxTotal: num(values["max-total"], "max-total", 400)
    });
    plan.name = values.name ?? (values.role ? `baseline-${role}` : "baseline");
    const rel = `data/plans/${plan.name}.json`;
    writeJson(path18.join(ctx.runDir, rel), plan);
    const byTag = {};
    for (const p of plan.probes) for (const t of p.tags ?? []) byTag[t] = (byTag[t] ?? 0) + 1;
    emit({ plan_file: path18.join(ctx.runDir, rel), name: plan.name, run_as: role, probes: plan.probes.length, by_tag: byTag, needs_variables: [...new Set(plan.probes.flatMap((p) => p.needs ?? []))], excluded_possible_side_effects: excluded, next: "Edit the plan (add business-rule probes, set vars, remove unsafe ones), then: api run --plan <plan_file>" });
    return 0;
  }
  if (sub === "run") {
    const { values } = opts(rest, { run: { type: "string" }, plan: { type: "string" }, "read-only": { type: "boolean", default: false }, "slow-ms": { type: "string" } });
    const ctx = loadRunContext(home, values.run);
    if (!values.plan) throw new UsageError("--plan <file> is required");
    const base = ctx.config.api.base_url;
    if (!base) throw new UsageError("api.base_url is not set in .qa/config.md");
    const given = values.plan;
    const byName = path18.join(ctx.runDir, "data", "plans", `${given.replace(/\.json$/, "")}.json`);
    const planFile = exists(path18.resolve(given)) ? path18.resolve(given) : exists(byName) ? byName : void 0;
    if (!planFile) throw new UsageError(`No plan "${given}": pass a file path, or the name of a plan in ${path18.join(ctx.runDir, "data", "plans")}.`);
    const plan = readJson(planFile);
    const result = await runPlan(plan, {
      baseUrl: base,
      policy: ctx.policy,
      roles: ctx.roles,
      ...ctx.config.api.login ? { login: ctx.config.api.login } : {},
      ...readInventory(ctx) ? { inventory: readInventory(ctx) } : {},
      runDir: ctx.runDir,
      readOnly: values["read-only"],
      ...values["slow-ms"] ? { slowMs: num(values["slow-ms"], "slow-ms", 3e3) } : {}
    });
    const flagged = result.results.filter((r) => !r.skipped && (r.signals.length || r.expectation_failures.length));
    const skipped = {};
    for (const r of result.results) if (r.skipped) skipped[r.skipped] = (skipped[r.skipped] ?? 0) + 1;
    emit({
      summary: result.summary,
      flagged: flagged.slice(0, 120).map((r) => ({ id: r.id, title: r.title, role: r.role, statuses: r.statuses, signals: r.signals, expectation_failures: r.expectation_failures, reproduced: r.reproduced, evidence: r.evidence })),
      flagged_not_shown: Math.max(0, flagged.length - 120),
      skipped,
      matrix: result.matrix,
      note: "Each flagged item was re-run once. 'reproduced.times' of 2 tells you whether it repeated. Judge each signal against the spec and the business rules before calling it a finding."
    });
    return 0;
  }
  throw new UsageError("api needs a subcommand: inventory | plan | run");
}
async function cmdReport(sub, rest, home) {
  const { values } = opts(rest, { run: { type: "string" } });
  const ctx = loadRunContext(home, values.run);
  if (sub === "build") {
    const data = readRunData(ctx.runDir);
    assignIds(ctx.runDir, data);
    const file = path18.join(ctx.runDir, "TECHNICAL-REPORT.md");
    fs14.writeFileSync(file, renderTechnicalReport(readRunData(ctx.runDir)), "utf8");
    emit({ report: file, findings: data.findings.map((f) => `${f.id} ${f.severity}: ${f.title}`), unconfirmed: data.unconfirmed.length, charters: data.charters.length });
    return 0;
  }
  if (sub === "lint") {
    const data = readRunData(ctx.runDir);
    assignIds(ctx.runDir, data);
    const result = lintRun(ctx.runDir, readRunData(ctx.runDir), ctx.passwords);
    emit(result);
    return result.ok ? 0 : 1;
  }
  throw new UsageError("report needs a subcommand: build | lint");
}
async function cmdMemory(sub, rest, home) {
  if (sub === "where") {
    const { values } = opts(rest, { project: { type: "string" } });
    const info = resolveProject(path18.resolve(values.project ?? process.cwd()));
    const { store } = ensureProjectStore(home, info);
    emit({ project_id: info.id, id_source: info.idSource, store });
    return 0;
  }
  if (sub === "context") {
    const { values } = opts(rest, { run: { type: "string" } });
    const ctx = loadRunContext(home, values.run);
    emit(loadMemoryContext(ctx.marker.store));
    return 0;
  }
  throw new UsageError("memory needs a subcommand: context | where");
}
async function cmdHook(sub, home) {
  if (sub !== "pre-tool-use") throw new UsageError("hook needs a subcommand: pre-tool-use");
  const raw = fs14.readFileSync(0, "utf8");
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return 0;
  }
  const tmp = [os3.tmpdir(), input.scratchpad_dir].filter((p) => !!p);
  const decision = decidePreToolUse(input, home, tmp);
  if (decision) process.stdout.write(JSON.stringify(toHookOutput(decision)) + "\n");
  return 0;
}
async function main(argv) {
  const [cmd, sub, ...rest] = argv;
  const home = qamindHome();
  try {
    switch (cmd) {
      case "run":
        return await cmdRun(sub, rest, home);
      case "config": {
        const { values } = opts(rest, { project: { type: "string" } });
        const root = path18.resolve(values.project ?? process.cwd());
        if (!exists(path18.join(root, ".qa", "config.md"))) throw new UsageError(`No .qa/config.md in ${root}. Run \`run start\` to create it.`);
        const check = checkConfigFile(root);
        const { config: _c, body: _b, ...printable } = check;
        emit(printable);
        return check.status === "ok" ? 0 : 4;
      }
      case "health": {
        const { values } = opts(sub ? [sub, ...rest] : rest, { run: { type: "string" } });
        const ctx = loadRunContext(home, values.run);
        const result = await runHealthCheck({ config: ctx.config, policy: ctx.policy, roles: ctx.roles });
        ensureDir(path18.join(ctx.runDir, "data"));
        writeJson(path18.join(ctx.runDir, "data", "health.json"), result);
        emit(result);
        return result.environment_ok ? 0 : 7;
      }
      case "api":
        return await cmdApi(sub, rest, home);
      case "report":
        return await cmdReport(sub, rest, home);
      case "memory":
        return await cmdMemory(sub, rest, home);
      case "guard": {
        if (sub !== "log") throw new UsageError("guard needs a subcommand: log");
        const { values } = opts(rest, { run: { type: "string" } });
        const ctx = loadRunContext(home, values.run);
        const entries = readBlocked(ctx.marker.store, ctx.marker.run_id);
        const byOrigin = {};
        for (const e of entries) {
          let origin = e.url;
          try {
            origin = new URL(e.url).origin;
          } catch {
          }
          byOrigin[origin] = { count: (byOrigin[origin]?.count ?? 0) + 1, reason: e.reason };
        }
        emit({ blocked_origins: byOrigin, note: "If a blocked origin is a legitimate asset host (CDN, fonts, login provider), add it to security.allowed_extra_origins in .qa/config.md; never add production." });
        return 0;
      }
      case "browser-mcp":
        return await runBrowserLauncher();
      case "hook":
        return await cmdHook(sub, home);
      case "version":
      case "--version":
        emit({ qamind: QAMIND_VERSION, knowledge: KNOWLEDGE_VERSION, node: process.version });
        return 0;
      case void 0:
      case "help":
      case "--help":
        process.stdout.write(HELP);
        return 0;
      default:
        throw new UsageError(`Unknown command "${cmd}".`);
    }
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`qamind: ${err.message}

${HELP}`);
      emit({ error: err.message, kind: "usage" });
      return 2;
    }
    process.stderr.write(`qamind: ${err.message}
`);
    emit({ error: err.message });
    return 1;
  }
}

// cli/src/bin.ts
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`qamind: ${err.stack ?? String(err)}
`);
    process.exit(1);
  }
);
