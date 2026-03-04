var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/compose.js
var compose = /* @__PURE__ */ __name((middleware, onError, onNotFound) => {
  return (context, next) => {
    let index = -1;
    return dispatch(0);
    async function dispatch(i) {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;
      let res;
      let isError = false;
      let handler;
      if (middleware[i]) {
        handler = middleware[i][0][0];
        context.req.routeIndex = i;
      } else {
        handler = i === middleware.length && next || void 0;
      }
      if (handler) {
        try {
          res = await handler(context, () => dispatch(i + 1));
        } catch (err) {
          if (err instanceof Error && onError) {
            context.error = err;
            res = await onError(err, context);
            isError = true;
          } else {
            throw err;
          }
        }
      } else {
        if (context.finalized === false && onNotFound) {
          res = await onNotFound(context);
        }
      }
      if (res && (context.finalized === false || isError)) {
        context.res = res;
      }
      return context;
    }
    __name(dispatch, "dispatch");
  };
}, "compose");

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/request/constants.js
var GET_MATCH_RESULT = /* @__PURE__ */ Symbol();

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/utils/body.js
var parseBody = /* @__PURE__ */ __name(async (request, options = /* @__PURE__ */ Object.create(null)) => {
  const { all = false, dot = false } = options;
  const headers = request instanceof HonoRequest ? request.raw.headers : request.headers;
  const contentType = headers.get("Content-Type");
  if (contentType?.startsWith("multipart/form-data") || contentType?.startsWith("application/x-www-form-urlencoded")) {
    return parseFormData(request, { all, dot });
  }
  return {};
}, "parseBody");
async function parseFormData(request, options) {
  const formData = await request.formData();
  if (formData) {
    return convertFormDataToBodyData(formData, options);
  }
  return {};
}
__name(parseFormData, "parseFormData");
function convertFormDataToBodyData(formData, options) {
  const form = /* @__PURE__ */ Object.create(null);
  formData.forEach((value, key) => {
    const shouldParseAllValues = options.all || key.endsWith("[]");
    if (!shouldParseAllValues) {
      form[key] = value;
    } else {
      handleParsingAllValues(form, key, value);
    }
  });
  if (options.dot) {
    Object.entries(form).forEach(([key, value]) => {
      const shouldParseDotValues = key.includes(".");
      if (shouldParseDotValues) {
        handleParsingNestedValues(form, key, value);
        delete form[key];
      }
    });
  }
  return form;
}
__name(convertFormDataToBodyData, "convertFormDataToBodyData");
var handleParsingAllValues = /* @__PURE__ */ __name((form, key, value) => {
  if (form[key] !== void 0) {
    if (Array.isArray(form[key])) {
      ;
      form[key].push(value);
    } else {
      form[key] = [form[key], value];
    }
  } else {
    if (!key.endsWith("[]")) {
      form[key] = value;
    } else {
      form[key] = [value];
    }
  }
}, "handleParsingAllValues");
var handleParsingNestedValues = /* @__PURE__ */ __name((form, key, value) => {
  let nestedForm = form;
  const keys = key.split(".");
  keys.forEach((key2, index) => {
    if (index === keys.length - 1) {
      nestedForm[key2] = value;
    } else {
      if (!nestedForm[key2] || typeof nestedForm[key2] !== "object" || Array.isArray(nestedForm[key2]) || nestedForm[key2] instanceof File) {
        nestedForm[key2] = /* @__PURE__ */ Object.create(null);
      }
      nestedForm = nestedForm[key2];
    }
  });
}, "handleParsingNestedValues");

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/utils/url.js
var splitPath = /* @__PURE__ */ __name((path) => {
  const paths = path.split("/");
  if (paths[0] === "") {
    paths.shift();
  }
  return paths;
}, "splitPath");
var splitRoutingPath = /* @__PURE__ */ __name((routePath) => {
  const { groups, path } = extractGroupsFromPath(routePath);
  const paths = splitPath(path);
  return replaceGroupMarks(paths, groups);
}, "splitRoutingPath");
var extractGroupsFromPath = /* @__PURE__ */ __name((path) => {
  const groups = [];
  path = path.replace(/\{[^}]+\}/g, (match2, index) => {
    const mark = `@${index}`;
    groups.push([mark, match2]);
    return mark;
  });
  return { groups, path };
}, "extractGroupsFromPath");
var replaceGroupMarks = /* @__PURE__ */ __name((paths, groups) => {
  for (let i = groups.length - 1; i >= 0; i--) {
    const [mark] = groups[i];
    for (let j = paths.length - 1; j >= 0; j--) {
      if (paths[j].includes(mark)) {
        paths[j] = paths[j].replace(mark, groups[i][1]);
        break;
      }
    }
  }
  return paths;
}, "replaceGroupMarks");
var patternCache = {};
var getPattern = /* @__PURE__ */ __name((label, next) => {
  if (label === "*") {
    return "*";
  }
  const match2 = label.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
  if (match2) {
    const cacheKey = `${label}#${next}`;
    if (!patternCache[cacheKey]) {
      if (match2[2]) {
        patternCache[cacheKey] = next && next[0] !== ":" && next[0] !== "*" ? [cacheKey, match2[1], new RegExp(`^${match2[2]}(?=/${next})`)] : [label, match2[1], new RegExp(`^${match2[2]}$`)];
      } else {
        patternCache[cacheKey] = [label, match2[1], true];
      }
    }
    return patternCache[cacheKey];
  }
  return null;
}, "getPattern");
var tryDecode = /* @__PURE__ */ __name((str, decoder) => {
  try {
    return decoder(str);
  } catch {
    return str.replace(/(?:%[0-9A-Fa-f]{2})+/g, (match2) => {
      try {
        return decoder(match2);
      } catch {
        return match2;
      }
    });
  }
}, "tryDecode");
var tryDecodeURI = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURI), "tryDecodeURI");
var getPath = /* @__PURE__ */ __name((request) => {
  const url = request.url;
  const start = url.indexOf("/", url.indexOf(":") + 4);
  let i = start;
  for (; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    if (charCode === 37) {
      const queryIndex = url.indexOf("?", i);
      const hashIndex = url.indexOf("#", i);
      const end = queryIndex === -1 ? hashIndex === -1 ? void 0 : hashIndex : hashIndex === -1 ? queryIndex : Math.min(queryIndex, hashIndex);
      const path = url.slice(start, end);
      return tryDecodeURI(path.includes("%25") ? path.replace(/%25/g, "%2525") : path);
    } else if (charCode === 63 || charCode === 35) {
      break;
    }
  }
  return url.slice(start, i);
}, "getPath");
var getPathNoStrict = /* @__PURE__ */ __name((request) => {
  const result = getPath(request);
  return result.length > 1 && result.at(-1) === "/" ? result.slice(0, -1) : result;
}, "getPathNoStrict");
var mergePath = /* @__PURE__ */ __name((base, sub, ...rest) => {
  if (rest.length) {
    sub = mergePath(sub, ...rest);
  }
  return `${base?.[0] === "/" ? "" : "/"}${base}${sub === "/" ? "" : `${base?.at(-1) === "/" ? "" : "/"}${sub?.[0] === "/" ? sub.slice(1) : sub}`}`;
}, "mergePath");
var checkOptionalParameter = /* @__PURE__ */ __name((path) => {
  if (path.charCodeAt(path.length - 1) !== 63 || !path.includes(":")) {
    return null;
  }
  const segments = path.split("/");
  const results = [];
  let basePath = "";
  segments.forEach((segment) => {
    if (segment !== "" && !/\:/.test(segment)) {
      basePath += "/" + segment;
    } else if (/\:/.test(segment)) {
      if (/\?/.test(segment)) {
        if (results.length === 0 && basePath === "") {
          results.push("/");
        } else {
          results.push(basePath);
        }
        const optionalSegment = segment.replace("?", "");
        basePath += "/" + optionalSegment;
        results.push(basePath);
      } else {
        basePath += "/" + segment;
      }
    }
  });
  return results.filter((v, i, a) => a.indexOf(v) === i);
}, "checkOptionalParameter");
var _decodeURI = /* @__PURE__ */ __name((value) => {
  if (!/[%+]/.test(value)) {
    return value;
  }
  if (value.indexOf("+") !== -1) {
    value = value.replace(/\+/g, " ");
  }
  return value.indexOf("%") !== -1 ? tryDecode(value, decodeURIComponent_) : value;
}, "_decodeURI");
var _getQueryParam = /* @__PURE__ */ __name((url, key, multiple) => {
  let encoded;
  if (!multiple && key && !/[%+]/.test(key)) {
    let keyIndex2 = url.indexOf("?", 8);
    if (keyIndex2 === -1) {
      return void 0;
    }
    if (!url.startsWith(key, keyIndex2 + 1)) {
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    while (keyIndex2 !== -1) {
      const trailingKeyCode = url.charCodeAt(keyIndex2 + key.length + 1);
      if (trailingKeyCode === 61) {
        const valueIndex = keyIndex2 + key.length + 2;
        const endIndex = url.indexOf("&", valueIndex);
        return _decodeURI(url.slice(valueIndex, endIndex === -1 ? void 0 : endIndex));
      } else if (trailingKeyCode == 38 || isNaN(trailingKeyCode)) {
        return "";
      }
      keyIndex2 = url.indexOf(`&${key}`, keyIndex2 + 1);
    }
    encoded = /[%+]/.test(url);
    if (!encoded) {
      return void 0;
    }
  }
  const results = {};
  encoded ??= /[%+]/.test(url);
  let keyIndex = url.indexOf("?", 8);
  while (keyIndex !== -1) {
    const nextKeyIndex = url.indexOf("&", keyIndex + 1);
    let valueIndex = url.indexOf("=", keyIndex);
    if (valueIndex > nextKeyIndex && nextKeyIndex !== -1) {
      valueIndex = -1;
    }
    let name = url.slice(
      keyIndex + 1,
      valueIndex === -1 ? nextKeyIndex === -1 ? void 0 : nextKeyIndex : valueIndex
    );
    if (encoded) {
      name = _decodeURI(name);
    }
    keyIndex = nextKeyIndex;
    if (name === "") {
      continue;
    }
    let value;
    if (valueIndex === -1) {
      value = "";
    } else {
      value = url.slice(valueIndex + 1, nextKeyIndex === -1 ? void 0 : nextKeyIndex);
      if (encoded) {
        value = _decodeURI(value);
      }
    }
    if (multiple) {
      if (!(results[name] && Array.isArray(results[name]))) {
        results[name] = [];
      }
      ;
      results[name].push(value);
    } else {
      results[name] ??= value;
    }
  }
  return key ? results[key] : results;
}, "_getQueryParam");
var getQueryParam = _getQueryParam;
var getQueryParams = /* @__PURE__ */ __name((url, key) => {
  return _getQueryParam(url, key, true);
}, "getQueryParams");
var decodeURIComponent_ = decodeURIComponent;

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/request.js
var tryDecodeURIComponent = /* @__PURE__ */ __name((str) => tryDecode(str, decodeURIComponent_), "tryDecodeURIComponent");
var HonoRequest = class {
  static {
    __name(this, "HonoRequest");
  }
  /**
   * `.raw` can get the raw Request object.
   *
   * @see {@link https://hono.dev/docs/api/request#raw}
   *
   * @example
   * ```ts
   * // For Cloudflare Workers
   * app.post('/', async (c) => {
   *   const metadata = c.req.raw.cf?.hostMetadata?
   *   ...
   * })
   * ```
   */
  raw;
  #validatedData;
  // Short name of validatedData
  #matchResult;
  routeIndex = 0;
  /**
   * `.path` can get the pathname of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#path}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const pathname = c.req.path // `/about/me`
   * })
   * ```
   */
  path;
  bodyCache = {};
  constructor(request, path = "/", matchResult = [[]]) {
    this.raw = request;
    this.path = path;
    this.#matchResult = matchResult;
    this.#validatedData = {};
  }
  param(key) {
    return key ? this.#getDecodedParam(key) : this.#getAllDecodedParams();
  }
  #getDecodedParam(key) {
    const paramKey = this.#matchResult[0][this.routeIndex][1][key];
    const param = this.#getParamValue(paramKey);
    return param && /\%/.test(param) ? tryDecodeURIComponent(param) : param;
  }
  #getAllDecodedParams() {
    const decoded = {};
    const keys = Object.keys(this.#matchResult[0][this.routeIndex][1]);
    for (const key of keys) {
      const value = this.#getParamValue(this.#matchResult[0][this.routeIndex][1][key]);
      if (value !== void 0) {
        decoded[key] = /\%/.test(value) ? tryDecodeURIComponent(value) : value;
      }
    }
    return decoded;
  }
  #getParamValue(paramKey) {
    return this.#matchResult[1] ? this.#matchResult[1][paramKey] : paramKey;
  }
  query(key) {
    return getQueryParam(this.url, key);
  }
  queries(key) {
    return getQueryParams(this.url, key);
  }
  header(name) {
    if (name) {
      return this.raw.headers.get(name) ?? void 0;
    }
    const headerData = {};
    this.raw.headers.forEach((value, key) => {
      headerData[key] = value;
    });
    return headerData;
  }
  async parseBody(options) {
    return this.bodyCache.parsedBody ??= await parseBody(this, options);
  }
  #cachedBody = /* @__PURE__ */ __name((key) => {
    const { bodyCache, raw: raw2 } = this;
    const cachedBody = bodyCache[key];
    if (cachedBody) {
      return cachedBody;
    }
    const anyCachedKey = Object.keys(bodyCache)[0];
    if (anyCachedKey) {
      return bodyCache[anyCachedKey].then((body) => {
        if (anyCachedKey === "json") {
          body = JSON.stringify(body);
        }
        return new Response(body)[key]();
      });
    }
    return bodyCache[key] = raw2[key]();
  }, "#cachedBody");
  /**
   * `.json()` can parse Request body of type `application/json`
   *
   * @see {@link https://hono.dev/docs/api/request#json}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.json()
   * })
   * ```
   */
  json() {
    return this.#cachedBody("text").then((text) => JSON.parse(text));
  }
  /**
   * `.text()` can parse Request body of type `text/plain`
   *
   * @see {@link https://hono.dev/docs/api/request#text}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.text()
   * })
   * ```
   */
  text() {
    return this.#cachedBody("text");
  }
  /**
   * `.arrayBuffer()` parse Request body as an `ArrayBuffer`
   *
   * @see {@link https://hono.dev/docs/api/request#arraybuffer}
   *
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.arrayBuffer()
   * })
   * ```
   */
  arrayBuffer() {
    return this.#cachedBody("arrayBuffer");
  }
  /**
   * Parses the request body as a `Blob`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.blob();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#blob
   */
  blob() {
    return this.#cachedBody("blob");
  }
  /**
   * Parses the request body as `FormData`.
   * @example
   * ```ts
   * app.post('/entry', async (c) => {
   *   const body = await c.req.formData();
   * });
   * ```
   * @see https://hono.dev/docs/api/request#formdata
   */
  formData() {
    return this.#cachedBody("formData");
  }
  /**
   * Adds validated data to the request.
   *
   * @param target - The target of the validation.
   * @param data - The validated data to add.
   */
  addValidatedData(target, data) {
    this.#validatedData[target] = data;
  }
  valid(target) {
    return this.#validatedData[target];
  }
  /**
   * `.url()` can get the request url strings.
   *
   * @see {@link https://hono.dev/docs/api/request#url}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const url = c.req.url // `http://localhost:8787/about/me`
   *   ...
   * })
   * ```
   */
  get url() {
    return this.raw.url;
  }
  /**
   * `.method()` can get the method name of the request.
   *
   * @see {@link https://hono.dev/docs/api/request#method}
   *
   * @example
   * ```ts
   * app.get('/about/me', (c) => {
   *   const method = c.req.method // `GET`
   * })
   * ```
   */
  get method() {
    return this.raw.method;
  }
  get [GET_MATCH_RESULT]() {
    return this.#matchResult;
  }
  /**
   * `.matchedRoutes()` can return a matched route in the handler
   *
   * @deprecated
   *
   * Use matchedRoutes helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#matchedroutes}
   *
   * @example
   * ```ts
   * app.use('*', async function logger(c, next) {
   *   await next()
   *   c.req.matchedRoutes.forEach(({ handler, method, path }, i) => {
   *     const name = handler.name || (handler.length < 2 ? '[handler]' : '[middleware]')
   *     console.log(
   *       method,
   *       ' ',
   *       path,
   *       ' '.repeat(Math.max(10 - path.length, 0)),
   *       name,
   *       i === c.req.routeIndex ? '<- respond from here' : ''
   *     )
   *   })
   * })
   * ```
   */
  get matchedRoutes() {
    return this.#matchResult[0].map(([[, route]]) => route);
  }
  /**
   * `routePath()` can retrieve the path registered within the handler
   *
   * @deprecated
   *
   * Use routePath helper defined in "hono/route" instead.
   *
   * @see {@link https://hono.dev/docs/api/request#routepath}
   *
   * @example
   * ```ts
   * app.get('/posts/:id', (c) => {
   *   return c.json({ path: c.req.routePath })
   * })
   * ```
   */
  get routePath() {
    return this.#matchResult[0].map(([[, route]]) => route)[this.routeIndex].path;
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/utils/html.js
var HtmlEscapedCallbackPhase = {
  Stringify: 1,
  BeforeStream: 2,
  Stream: 3
};
var raw = /* @__PURE__ */ __name((value, callbacks) => {
  const escapedString = new String(value);
  escapedString.isEscaped = true;
  escapedString.callbacks = callbacks;
  return escapedString;
}, "raw");
var resolveCallback = /* @__PURE__ */ __name(async (str, phase, preserveCallbacks, context, buffer) => {
  if (typeof str === "object" && !(str instanceof String)) {
    if (!(str instanceof Promise)) {
      str = str.toString();
    }
    if (str instanceof Promise) {
      str = await str;
    }
  }
  const callbacks = str.callbacks;
  if (!callbacks?.length) {
    return Promise.resolve(str);
  }
  if (buffer) {
    buffer[0] += str;
  } else {
    buffer = [str];
  }
  const resStr = Promise.all(callbacks.map((c) => c({ phase, buffer, context }))).then(
    (res) => Promise.all(
      res.filter(Boolean).map((str2) => resolveCallback(str2, phase, false, context, buffer))
    ).then(() => buffer[0])
  );
  if (preserveCallbacks) {
    return raw(await resStr, callbacks);
  } else {
    return resStr;
  }
}, "resolveCallback");

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/context.js
var TEXT_PLAIN = "text/plain; charset=UTF-8";
var setDefaultContentType = /* @__PURE__ */ __name((contentType, headers) => {
  return {
    "Content-Type": contentType,
    ...headers
  };
}, "setDefaultContentType");
var Context = class {
  static {
    __name(this, "Context");
  }
  #rawRequest;
  #req;
  /**
   * `.env` can get bindings (environment variables, secrets, KV namespaces, D1 database, R2 bucket etc.) in Cloudflare Workers.
   *
   * @see {@link https://hono.dev/docs/api/context#env}
   *
   * @example
   * ```ts
   * // Environment object for Cloudflare Workers
   * app.get('*', async c => {
   *   const counter = c.env.COUNTER
   * })
   * ```
   */
  env = {};
  #var;
  finalized = false;
  /**
   * `.error` can get the error object from the middleware if the Handler throws an error.
   *
   * @see {@link https://hono.dev/docs/api/context#error}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   await next()
   *   if (c.error) {
   *     // do something...
   *   }
   * })
   * ```
   */
  error;
  #status;
  #executionCtx;
  #res;
  #layout;
  #renderer;
  #notFoundHandler;
  #preparedHeaders;
  #matchResult;
  #path;
  /**
   * Creates an instance of the Context class.
   *
   * @param req - The Request object.
   * @param options - Optional configuration options for the context.
   */
  constructor(req, options) {
    this.#rawRequest = req;
    if (options) {
      this.#executionCtx = options.executionCtx;
      this.env = options.env;
      this.#notFoundHandler = options.notFoundHandler;
      this.#path = options.path;
      this.#matchResult = options.matchResult;
    }
  }
  /**
   * `.req` is the instance of {@link HonoRequest}.
   */
  get req() {
    this.#req ??= new HonoRequest(this.#rawRequest, this.#path, this.#matchResult);
    return this.#req;
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#event}
   * The FetchEvent associated with the current request.
   *
   * @throws Will throw an error if the context does not have a FetchEvent.
   */
  get event() {
    if (this.#executionCtx && "respondWith" in this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no FetchEvent");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#executionctx}
   * The ExecutionContext associated with the current request.
   *
   * @throws Will throw an error if the context does not have an ExecutionContext.
   */
  get executionCtx() {
    if (this.#executionCtx) {
      return this.#executionCtx;
    } else {
      throw Error("This context has no ExecutionContext");
    }
  }
  /**
   * @see {@link https://hono.dev/docs/api/context#res}
   * The Response object for the current request.
   */
  get res() {
    return this.#res ||= new Response(null, {
      headers: this.#preparedHeaders ??= new Headers()
    });
  }
  /**
   * Sets the Response object for the current request.
   *
   * @param _res - The Response object to set.
   */
  set res(_res) {
    if (this.#res && _res) {
      _res = new Response(_res.body, _res);
      for (const [k, v] of this.#res.headers.entries()) {
        if (k === "content-type") {
          continue;
        }
        if (k === "set-cookie") {
          const cookies = this.#res.headers.getSetCookie();
          _res.headers.delete("set-cookie");
          for (const cookie of cookies) {
            _res.headers.append("set-cookie", cookie);
          }
        } else {
          _res.headers.set(k, v);
        }
      }
    }
    this.#res = _res;
    this.finalized = true;
  }
  /**
   * `.render()` can create a response within a layout.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   return c.render('Hello!')
   * })
   * ```
   */
  render = /* @__PURE__ */ __name((...args) => {
    this.#renderer ??= (content) => this.html(content);
    return this.#renderer(...args);
  }, "render");
  /**
   * Sets the layout for the response.
   *
   * @param layout - The layout to set.
   * @returns The layout function.
   */
  setLayout = /* @__PURE__ */ __name((layout) => this.#layout = layout, "setLayout");
  /**
   * Gets the current layout for the response.
   *
   * @returns The current layout function.
   */
  getLayout = /* @__PURE__ */ __name(() => this.#layout, "getLayout");
  /**
   * `.setRenderer()` can set the layout in the custom middleware.
   *
   * @see {@link https://hono.dev/docs/api/context#render-setrenderer}
   *
   * @example
   * ```tsx
   * app.use('*', async (c, next) => {
   *   c.setRenderer((content) => {
   *     return c.html(
   *       <html>
   *         <body>
   *           <p>{content}</p>
   *         </body>
   *       </html>
   *     )
   *   })
   *   await next()
   * })
   * ```
   */
  setRenderer = /* @__PURE__ */ __name((renderer) => {
    this.#renderer = renderer;
  }, "setRenderer");
  /**
   * `.header()` can set headers.
   *
   * @see {@link https://hono.dev/docs/api/context#header}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  header = /* @__PURE__ */ __name((name, value, options) => {
    if (this.finalized) {
      this.#res = new Response(this.#res.body, this.#res);
    }
    const headers = this.#res ? this.#res.headers : this.#preparedHeaders ??= new Headers();
    if (value === void 0) {
      headers.delete(name);
    } else if (options?.append) {
      headers.append(name, value);
    } else {
      headers.set(name, value);
    }
  }, "header");
  status = /* @__PURE__ */ __name((status) => {
    this.#status = status;
  }, "status");
  /**
   * `.set()` can set the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.use('*', async (c, next) => {
   *   c.set('message', 'Hono is hot!!')
   *   await next()
   * })
   * ```
   */
  set = /* @__PURE__ */ __name((key, value) => {
    this.#var ??= /* @__PURE__ */ new Map();
    this.#var.set(key, value);
  }, "set");
  /**
   * `.get()` can use the value specified by the key.
   *
   * @see {@link https://hono.dev/docs/api/context#set-get}
   *
   * @example
   * ```ts
   * app.get('/', (c) => {
   *   const message = c.get('message')
   *   return c.text(`The message is "${message}"`)
   * })
   * ```
   */
  get = /* @__PURE__ */ __name((key) => {
    return this.#var ? this.#var.get(key) : void 0;
  }, "get");
  /**
   * `.var` can access the value of a variable.
   *
   * @see {@link https://hono.dev/docs/api/context#var}
   *
   * @example
   * ```ts
   * const result = c.var.client.oneMethod()
   * ```
   */
  // c.var.propName is a read-only
  get var() {
    if (!this.#var) {
      return {};
    }
    return Object.fromEntries(this.#var);
  }
  #newResponse(data, arg, headers) {
    const responseHeaders = this.#res ? new Headers(this.#res.headers) : this.#preparedHeaders ?? new Headers();
    if (typeof arg === "object" && "headers" in arg) {
      const argHeaders = arg.headers instanceof Headers ? arg.headers : new Headers(arg.headers);
      for (const [key, value] of argHeaders) {
        if (key.toLowerCase() === "set-cookie") {
          responseHeaders.append(key, value);
        } else {
          responseHeaders.set(key, value);
        }
      }
    }
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        if (typeof v === "string") {
          responseHeaders.set(k, v);
        } else {
          responseHeaders.delete(k);
          for (const v2 of v) {
            responseHeaders.append(k, v2);
          }
        }
      }
    }
    const status = typeof arg === "number" ? arg : arg?.status ?? this.#status;
    return new Response(data, { status, headers: responseHeaders });
  }
  newResponse = /* @__PURE__ */ __name((...args) => this.#newResponse(...args), "newResponse");
  /**
   * `.body()` can return the HTTP response.
   * You can set headers with `.header()` and set HTTP status code with `.status`.
   * This can also be set in `.text()`, `.json()` and so on.
   *
   * @see {@link https://hono.dev/docs/api/context#body}
   *
   * @example
   * ```ts
   * app.get('/welcome', (c) => {
   *   // Set headers
   *   c.header('X-Message', 'Hello!')
   *   c.header('Content-Type', 'text/plain')
   *   // Set HTTP status code
   *   c.status(201)
   *
   *   // Return the response body
   *   return c.body('Thank you for coming')
   * })
   * ```
   */
  body = /* @__PURE__ */ __name((data, arg, headers) => this.#newResponse(data, arg, headers), "body");
  /**
   * `.text()` can render text as `Content-Type:text/plain`.
   *
   * @see {@link https://hono.dev/docs/api/context#text}
   *
   * @example
   * ```ts
   * app.get('/say', (c) => {
   *   return c.text('Hello!')
   * })
   * ```
   */
  text = /* @__PURE__ */ __name((text, arg, headers) => {
    return !this.#preparedHeaders && !this.#status && !arg && !headers && !this.finalized ? new Response(text) : this.#newResponse(
      text,
      arg,
      setDefaultContentType(TEXT_PLAIN, headers)
    );
  }, "text");
  /**
   * `.json()` can render JSON as `Content-Type:application/json`.
   *
   * @see {@link https://hono.dev/docs/api/context#json}
   *
   * @example
   * ```ts
   * app.get('/api', (c) => {
   *   return c.json({ message: 'Hello!' })
   * })
   * ```
   */
  json = /* @__PURE__ */ __name((object, arg, headers) => {
    return this.#newResponse(
      JSON.stringify(object),
      arg,
      setDefaultContentType("application/json", headers)
    );
  }, "json");
  html = /* @__PURE__ */ __name((html, arg, headers) => {
    const res = /* @__PURE__ */ __name((html2) => this.#newResponse(html2, arg, setDefaultContentType("text/html; charset=UTF-8", headers)), "res");
    return typeof html === "object" ? resolveCallback(html, HtmlEscapedCallbackPhase.Stringify, false, {}).then(res) : res(html);
  }, "html");
  /**
   * `.redirect()` can Redirect, default status code is 302.
   *
   * @see {@link https://hono.dev/docs/api/context#redirect}
   *
   * @example
   * ```ts
   * app.get('/redirect', (c) => {
   *   return c.redirect('/')
   * })
   * app.get('/redirect-permanently', (c) => {
   *   return c.redirect('/', 301)
   * })
   * ```
   */
  redirect = /* @__PURE__ */ __name((location, status) => {
    const locationString = String(location);
    this.header(
      "Location",
      // Multibyes should be encoded
      // eslint-disable-next-line no-control-regex
      !/[^\x00-\xFF]/.test(locationString) ? locationString : encodeURI(locationString)
    );
    return this.newResponse(null, status ?? 302);
  }, "redirect");
  /**
   * `.notFound()` can return the Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/context#notfound}
   *
   * @example
   * ```ts
   * app.get('/notfound', (c) => {
   *   return c.notFound()
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name(() => {
    this.#notFoundHandler ??= () => new Response();
    return this.#notFoundHandler(this);
  }, "notFound");
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router.js
var METHOD_NAME_ALL = "ALL";
var METHOD_NAME_ALL_LOWERCASE = "all";
var METHODS = ["get", "post", "put", "delete", "options", "patch"];
var MESSAGE_MATCHER_IS_ALREADY_BUILT = "Can not add a route since the matcher is already built.";
var UnsupportedPathError = class extends Error {
  static {
    __name(this, "UnsupportedPathError");
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/utils/constants.js
var COMPOSED_HANDLER = "__COMPOSED_HANDLER";

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/hono-base.js
var notFoundHandler = /* @__PURE__ */ __name((c) => {
  return c.text("404 Not Found", 404);
}, "notFoundHandler");
var errorHandler = /* @__PURE__ */ __name((err, c) => {
  if ("getResponse" in err) {
    const res = err.getResponse();
    return c.newResponse(res.body, res);
  }
  console.error(err);
  return c.text("Internal Server Error", 500);
}, "errorHandler");
var Hono = class _Hono {
  static {
    __name(this, "_Hono");
  }
  get;
  post;
  put;
  delete;
  options;
  patch;
  all;
  on;
  use;
  /*
    This class is like an abstract class and does not have a router.
    To use it, inherit the class and implement router in the constructor.
  */
  router;
  getPath;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  _basePath = "/";
  #path = "/";
  routes = [];
  constructor(options = {}) {
    const allMethods = [...METHODS, METHOD_NAME_ALL_LOWERCASE];
    allMethods.forEach((method) => {
      this[method] = (args1, ...args) => {
        if (typeof args1 === "string") {
          this.#path = args1;
        } else {
          this.#addRoute(method, this.#path, args1);
        }
        args.forEach((handler) => {
          this.#addRoute(method, this.#path, handler);
        });
        return this;
      };
    });
    this.on = (method, path, ...handlers) => {
      for (const p of [path].flat()) {
        this.#path = p;
        for (const m of [method].flat()) {
          handlers.map((handler) => {
            this.#addRoute(m.toUpperCase(), this.#path, handler);
          });
        }
      }
      return this;
    };
    this.use = (arg1, ...handlers) => {
      if (typeof arg1 === "string") {
        this.#path = arg1;
      } else {
        this.#path = "*";
        handlers.unshift(arg1);
      }
      handlers.forEach((handler) => {
        this.#addRoute(METHOD_NAME_ALL, this.#path, handler);
      });
      return this;
    };
    const { strict, ...optionsWithoutStrict } = options;
    Object.assign(this, optionsWithoutStrict);
    this.getPath = strict ?? true ? options.getPath ?? getPath : getPathNoStrict;
  }
  #clone() {
    const clone = new _Hono({
      router: this.router,
      getPath: this.getPath
    });
    clone.errorHandler = this.errorHandler;
    clone.#notFoundHandler = this.#notFoundHandler;
    clone.routes = this.routes;
    return clone;
  }
  #notFoundHandler = notFoundHandler;
  // Cannot use `#` because it requires visibility at JavaScript runtime.
  errorHandler = errorHandler;
  /**
   * `.route()` allows grouping other Hono instance in routes.
   *
   * @see {@link https://hono.dev/docs/api/routing#grouping}
   *
   * @param {string} path - base Path
   * @param {Hono} app - other Hono instance
   * @returns {Hono} routed Hono instance
   *
   * @example
   * ```ts
   * const app = new Hono()
   * const app2 = new Hono()
   *
   * app2.get("/user", (c) => c.text("user"))
   * app.route("/api", app2) // GET /api/user
   * ```
   */
  route(path, app2) {
    const subApp = this.basePath(path);
    app2.routes.map((r) => {
      let handler;
      if (app2.errorHandler === errorHandler) {
        handler = r.handler;
      } else {
        handler = /* @__PURE__ */ __name(async (c, next) => (await compose([], app2.errorHandler)(c, () => r.handler(c, next))).res, "handler");
        handler[COMPOSED_HANDLER] = r.handler;
      }
      subApp.#addRoute(r.method, r.path, handler);
    });
    return this;
  }
  /**
   * `.basePath()` allows base paths to be specified.
   *
   * @see {@link https://hono.dev/docs/api/routing#base-path}
   *
   * @param {string} path - base Path
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * const api = new Hono().basePath('/api')
   * ```
   */
  basePath(path) {
    const subApp = this.#clone();
    subApp._basePath = mergePath(this._basePath, path);
    return subApp;
  }
  /**
   * `.onError()` handles an error and returns a customized Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#error-handling}
   *
   * @param {ErrorHandler} handler - request Handler for error
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.onError((err, c) => {
   *   console.error(`${err}`)
   *   return c.text('Custom Error Message', 500)
   * })
   * ```
   */
  onError = /* @__PURE__ */ __name((handler) => {
    this.errorHandler = handler;
    return this;
  }, "onError");
  /**
   * `.notFound()` allows you to customize a Not Found Response.
   *
   * @see {@link https://hono.dev/docs/api/hono#not-found}
   *
   * @param {NotFoundHandler} handler - request handler for not-found
   * @returns {Hono} changed Hono instance
   *
   * @example
   * ```ts
   * app.notFound((c) => {
   *   return c.text('Custom 404 Message', 404)
   * })
   * ```
   */
  notFound = /* @__PURE__ */ __name((handler) => {
    this.#notFoundHandler = handler;
    return this;
  }, "notFound");
  /**
   * `.mount()` allows you to mount applications built with other frameworks into your Hono application.
   *
   * @see {@link https://hono.dev/docs/api/hono#mount}
   *
   * @param {string} path - base Path
   * @param {Function} applicationHandler - other Request Handler
   * @param {MountOptions} [options] - options of `.mount()`
   * @returns {Hono} mounted Hono instance
   *
   * @example
   * ```ts
   * import { Router as IttyRouter } from 'itty-router'
   * import { Hono } from 'hono'
   * // Create itty-router application
   * const ittyRouter = IttyRouter()
   * // GET /itty-router/hello
   * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
   *
   * const app = new Hono()
   * app.mount('/itty-router', ittyRouter.handle)
   * ```
   *
   * @example
   * ```ts
   * const app = new Hono()
   * // Send the request to another application without modification.
   * app.mount('/app', anotherApp, {
   *   replaceRequest: (req) => req,
   * })
   * ```
   */
  mount(path, applicationHandler, options) {
    let replaceRequest;
    let optionHandler;
    if (options) {
      if (typeof options === "function") {
        optionHandler = options;
      } else {
        optionHandler = options.optionHandler;
        if (options.replaceRequest === false) {
          replaceRequest = /* @__PURE__ */ __name((request) => request, "replaceRequest");
        } else {
          replaceRequest = options.replaceRequest;
        }
      }
    }
    const getOptions = optionHandler ? (c) => {
      const options2 = optionHandler(c);
      return Array.isArray(options2) ? options2 : [options2];
    } : (c) => {
      let executionContext = void 0;
      try {
        executionContext = c.executionCtx;
      } catch {
      }
      return [c.env, executionContext];
    };
    replaceRequest ||= (() => {
      const mergedPath = mergePath(this._basePath, path);
      const pathPrefixLength = mergedPath === "/" ? 0 : mergedPath.length;
      return (request) => {
        const url = new URL(request.url);
        url.pathname = url.pathname.slice(pathPrefixLength) || "/";
        return new Request(url, request);
      };
    })();
    const handler = /* @__PURE__ */ __name(async (c, next) => {
      const res = await applicationHandler(replaceRequest(c.req.raw), ...getOptions(c));
      if (res) {
        return res;
      }
      await next();
    }, "handler");
    this.#addRoute(METHOD_NAME_ALL, mergePath(path, "*"), handler);
    return this;
  }
  #addRoute(method, path, handler) {
    method = method.toUpperCase();
    path = mergePath(this._basePath, path);
    const r = { basePath: this._basePath, path, method, handler };
    this.router.add(method, path, [handler, r]);
    this.routes.push(r);
  }
  #handleError(err, c) {
    if (err instanceof Error) {
      return this.errorHandler(err, c);
    }
    throw err;
  }
  #dispatch(request, executionCtx, env2, method) {
    if (method === "HEAD") {
      return (async () => new Response(null, await this.#dispatch(request, executionCtx, env2, "GET")))();
    }
    const path = this.getPath(request, { env: env2 });
    const matchResult = this.router.match(method, path);
    const c = new Context(request, {
      path,
      matchResult,
      env: env2,
      executionCtx,
      notFoundHandler: this.#notFoundHandler
    });
    if (matchResult[0].length === 1) {
      let res;
      try {
        res = matchResult[0][0][0][0](c, async () => {
          c.res = await this.#notFoundHandler(c);
        });
      } catch (err) {
        return this.#handleError(err, c);
      }
      return res instanceof Promise ? res.then(
        (resolved) => resolved || (c.finalized ? c.res : this.#notFoundHandler(c))
      ).catch((err) => this.#handleError(err, c)) : res ?? this.#notFoundHandler(c);
    }
    const composed = compose(matchResult[0], this.errorHandler, this.#notFoundHandler);
    return (async () => {
      try {
        const context = await composed(c);
        if (!context.finalized) {
          throw new Error(
            "Context is not finalized. Did you forget to return a Response object or `await next()`?"
          );
        }
        return context.res;
      } catch (err) {
        return this.#handleError(err, c);
      }
    })();
  }
  /**
   * `.fetch()` will be entry point of your app.
   *
   * @see {@link https://hono.dev/docs/api/hono#fetch}
   *
   * @param {Request} request - request Object of request
   * @param {Env} Env - env Object
   * @param {ExecutionContext} - context of execution
   * @returns {Response | Promise<Response>} response of request
   *
   */
  fetch = /* @__PURE__ */ __name((request, ...rest) => {
    return this.#dispatch(request, rest[1], rest[0], request.method);
  }, "fetch");
  /**
   * `.request()` is a useful method for testing.
   * You can pass a URL or pathname to send a GET request.
   * app will return a Response object.
   * ```ts
   * test('GET /hello is ok', async () => {
   *   const res = await app.request('/hello')
   *   expect(res.status).toBe(200)
   * })
   * ```
   * @see https://hono.dev/docs/api/hono#request
   */
  request = /* @__PURE__ */ __name((input, requestInit, Env, executionCtx) => {
    if (input instanceof Request) {
      return this.fetch(requestInit ? new Request(input, requestInit) : input, Env, executionCtx);
    }
    input = input.toString();
    return this.fetch(
      new Request(
        /^https?:\/\//.test(input) ? input : `http://localhost${mergePath("/", input)}`,
        requestInit
      ),
      Env,
      executionCtx
    );
  }, "request");
  /**
   * `.fire()` automatically adds a global fetch event listener.
   * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
   * @deprecated
   * Use `fire` from `hono/service-worker` instead.
   * ```ts
   * import { Hono } from 'hono'
   * import { fire } from 'hono/service-worker'
   *
   * const app = new Hono()
   * // ...
   * fire(app)
   * ```
   * @see https://hono.dev/docs/api/hono#fire
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
   * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
   */
  fire = /* @__PURE__ */ __name(() => {
    addEventListener("fetch", (event) => {
      event.respondWith(this.#dispatch(event.request, event, void 0, event.request.method));
    });
  }, "fire");
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/reg-exp-router/matcher.js
var emptyParam = [];
function match(method, path) {
  const matchers = this.buildAllMatchers();
  const match2 = /* @__PURE__ */ __name(((method2, path2) => {
    const matcher = matchers[method2] || matchers[METHOD_NAME_ALL];
    const staticMatch = matcher[2][path2];
    if (staticMatch) {
      return staticMatch;
    }
    const match3 = path2.match(matcher[0]);
    if (!match3) {
      return [[], emptyParam];
    }
    const index = match3.indexOf("", 1);
    return [matcher[1][index], match3];
  }), "match2");
  this.match = match2;
  return match2(method, path);
}
__name(match, "match");

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/reg-exp-router/node.js
var LABEL_REG_EXP_STR = "[^/]+";
var ONLY_WILDCARD_REG_EXP_STR = ".*";
var TAIL_WILDCARD_REG_EXP_STR = "(?:|/.*)";
var PATH_ERROR = /* @__PURE__ */ Symbol();
var regExpMetaChars = new Set(".\\+*[^]$()");
function compareKey(a, b) {
  if (a.length === 1) {
    return b.length === 1 ? a < b ? -1 : 1 : -1;
  }
  if (b.length === 1) {
    return 1;
  }
  if (a === ONLY_WILDCARD_REG_EXP_STR || a === TAIL_WILDCARD_REG_EXP_STR) {
    return 1;
  } else if (b === ONLY_WILDCARD_REG_EXP_STR || b === TAIL_WILDCARD_REG_EXP_STR) {
    return -1;
  }
  if (a === LABEL_REG_EXP_STR) {
    return 1;
  } else if (b === LABEL_REG_EXP_STR) {
    return -1;
  }
  return a.length === b.length ? a < b ? -1 : 1 : b.length - a.length;
}
__name(compareKey, "compareKey");
var Node = class _Node {
  static {
    __name(this, "_Node");
  }
  #index;
  #varIndex;
  #children = /* @__PURE__ */ Object.create(null);
  insert(tokens, index, paramMap, context, pathErrorCheckOnly) {
    if (tokens.length === 0) {
      if (this.#index !== void 0) {
        throw PATH_ERROR;
      }
      if (pathErrorCheckOnly) {
        return;
      }
      this.#index = index;
      return;
    }
    const [token, ...restTokens] = tokens;
    const pattern = token === "*" ? restTokens.length === 0 ? ["", "", ONLY_WILDCARD_REG_EXP_STR] : ["", "", LABEL_REG_EXP_STR] : token === "/*" ? ["", "", TAIL_WILDCARD_REG_EXP_STR] : token.match(/^\:([^\{\}]+)(?:\{(.+)\})?$/);
    let node;
    if (pattern) {
      const name = pattern[1];
      let regexpStr = pattern[2] || LABEL_REG_EXP_STR;
      if (name && pattern[2]) {
        if (regexpStr === ".*") {
          throw PATH_ERROR;
        }
        regexpStr = regexpStr.replace(/^\((?!\?:)(?=[^)]+\)$)/, "(?:");
        if (/\((?!\?:)/.test(regexpStr)) {
          throw PATH_ERROR;
        }
      }
      node = this.#children[regexpStr];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[regexpStr] = new _Node();
        if (name !== "") {
          node.#varIndex = context.varIndex++;
        }
      }
      if (!pathErrorCheckOnly && name !== "") {
        paramMap.push([name, node.#varIndex]);
      }
    } else {
      node = this.#children[token];
      if (!node) {
        if (Object.keys(this.#children).some(
          (k) => k.length > 1 && k !== ONLY_WILDCARD_REG_EXP_STR && k !== TAIL_WILDCARD_REG_EXP_STR
        )) {
          throw PATH_ERROR;
        }
        if (pathErrorCheckOnly) {
          return;
        }
        node = this.#children[token] = new _Node();
      }
    }
    node.insert(restTokens, index, paramMap, context, pathErrorCheckOnly);
  }
  buildRegExpStr() {
    const childKeys = Object.keys(this.#children).sort(compareKey);
    const strList = childKeys.map((k) => {
      const c = this.#children[k];
      return (typeof c.#varIndex === "number" ? `(${k})@${c.#varIndex}` : regExpMetaChars.has(k) ? `\\${k}` : k) + c.buildRegExpStr();
    });
    if (typeof this.#index === "number") {
      strList.unshift(`#${this.#index}`);
    }
    if (strList.length === 0) {
      return "";
    }
    if (strList.length === 1) {
      return strList[0];
    }
    return "(?:" + strList.join("|") + ")";
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/reg-exp-router/trie.js
var Trie = class {
  static {
    __name(this, "Trie");
  }
  #context = { varIndex: 0 };
  #root = new Node();
  insert(path, index, pathErrorCheckOnly) {
    const paramAssoc = [];
    const groups = [];
    for (let i = 0; ; ) {
      let replaced = false;
      path = path.replace(/\{[^}]+\}/g, (m) => {
        const mark = `@\\${i}`;
        groups[i] = [mark, m];
        i++;
        replaced = true;
        return mark;
      });
      if (!replaced) {
        break;
      }
    }
    const tokens = path.match(/(?::[^\/]+)|(?:\/\*$)|./g) || [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const [mark] = groups[i];
      for (let j = tokens.length - 1; j >= 0; j--) {
        if (tokens[j].indexOf(mark) !== -1) {
          tokens[j] = tokens[j].replace(mark, groups[i][1]);
          break;
        }
      }
    }
    this.#root.insert(tokens, index, paramAssoc, this.#context, pathErrorCheckOnly);
    return paramAssoc;
  }
  buildRegExp() {
    let regexp = this.#root.buildRegExpStr();
    if (regexp === "") {
      return [/^$/, [], []];
    }
    let captureIndex = 0;
    const indexReplacementMap = [];
    const paramReplacementMap = [];
    regexp = regexp.replace(/#(\d+)|@(\d+)|\.\*\$/g, (_, handlerIndex, paramIndex) => {
      if (handlerIndex !== void 0) {
        indexReplacementMap[++captureIndex] = Number(handlerIndex);
        return "$()";
      }
      if (paramIndex !== void 0) {
        paramReplacementMap[Number(paramIndex)] = ++captureIndex;
        return "";
      }
      return "";
    });
    return [new RegExp(`^${regexp}`), indexReplacementMap, paramReplacementMap];
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/reg-exp-router/router.js
var nullMatcher = [/^$/, [], /* @__PURE__ */ Object.create(null)];
var wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
function buildWildcardRegExp(path) {
  return wildcardRegExpCache[path] ??= new RegExp(
    path === "*" ? "" : `^${path.replace(
      /\/\*$|([.\\+*[^\]$()])/g,
      (_, metaChar) => metaChar ? `\\${metaChar}` : "(?:|/.*)"
    )}$`
  );
}
__name(buildWildcardRegExp, "buildWildcardRegExp");
function clearWildcardRegExpCache() {
  wildcardRegExpCache = /* @__PURE__ */ Object.create(null);
}
__name(clearWildcardRegExpCache, "clearWildcardRegExpCache");
function buildMatcherFromPreprocessedRoutes(routes) {
  const trie = new Trie();
  const handlerData = [];
  if (routes.length === 0) {
    return nullMatcher;
  }
  const routesWithStaticPathFlag = routes.map(
    (route) => [!/\*|\/:/.test(route[0]), ...route]
  ).sort(
    ([isStaticA, pathA], [isStaticB, pathB]) => isStaticA ? 1 : isStaticB ? -1 : pathA.length - pathB.length
  );
  const staticMap = /* @__PURE__ */ Object.create(null);
  for (let i = 0, j = -1, len = routesWithStaticPathFlag.length; i < len; i++) {
    const [pathErrorCheckOnly, path, handlers] = routesWithStaticPathFlag[i];
    if (pathErrorCheckOnly) {
      staticMap[path] = [handlers.map(([h]) => [h, /* @__PURE__ */ Object.create(null)]), emptyParam];
    } else {
      j++;
    }
    let paramAssoc;
    try {
      paramAssoc = trie.insert(path, j, pathErrorCheckOnly);
    } catch (e) {
      throw e === PATH_ERROR ? new UnsupportedPathError(path) : e;
    }
    if (pathErrorCheckOnly) {
      continue;
    }
    handlerData[j] = handlers.map(([h, paramCount]) => {
      const paramIndexMap = /* @__PURE__ */ Object.create(null);
      paramCount -= 1;
      for (; paramCount >= 0; paramCount--) {
        const [key, value] = paramAssoc[paramCount];
        paramIndexMap[key] = value;
      }
      return [h, paramIndexMap];
    });
  }
  const [regexp, indexReplacementMap, paramReplacementMap] = trie.buildRegExp();
  for (let i = 0, len = handlerData.length; i < len; i++) {
    for (let j = 0, len2 = handlerData[i].length; j < len2; j++) {
      const map = handlerData[i][j]?.[1];
      if (!map) {
        continue;
      }
      const keys = Object.keys(map);
      for (let k = 0, len3 = keys.length; k < len3; k++) {
        map[keys[k]] = paramReplacementMap[map[keys[k]]];
      }
    }
  }
  const handlerMap = [];
  for (const i in indexReplacementMap) {
    handlerMap[i] = handlerData[indexReplacementMap[i]];
  }
  return [regexp, handlerMap, staticMap];
}
__name(buildMatcherFromPreprocessedRoutes, "buildMatcherFromPreprocessedRoutes");
function findMiddleware(middleware, path) {
  if (!middleware) {
    return void 0;
  }
  for (const k of Object.keys(middleware).sort((a, b) => b.length - a.length)) {
    if (buildWildcardRegExp(k).test(path)) {
      return [...middleware[k]];
    }
  }
  return void 0;
}
__name(findMiddleware, "findMiddleware");
var RegExpRouter = class {
  static {
    __name(this, "RegExpRouter");
  }
  name = "RegExpRouter";
  #middleware;
  #routes;
  constructor() {
    this.#middleware = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
    this.#routes = { [METHOD_NAME_ALL]: /* @__PURE__ */ Object.create(null) };
  }
  add(method, path, handler) {
    const middleware = this.#middleware;
    const routes = this.#routes;
    if (!middleware || !routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    if (!middleware[method]) {
      ;
      [middleware, routes].forEach((handlerMap) => {
        handlerMap[method] = /* @__PURE__ */ Object.create(null);
        Object.keys(handlerMap[METHOD_NAME_ALL]).forEach((p) => {
          handlerMap[method][p] = [...handlerMap[METHOD_NAME_ALL][p]];
        });
      });
    }
    if (path === "/*") {
      path = "*";
    }
    const paramCount = (path.match(/\/:/g) || []).length;
    if (/\*$/.test(path)) {
      const re = buildWildcardRegExp(path);
      if (method === METHOD_NAME_ALL) {
        Object.keys(middleware).forEach((m) => {
          middleware[m][path] ||= findMiddleware(middleware[m], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
        });
      } else {
        middleware[method][path] ||= findMiddleware(middleware[method], path) || findMiddleware(middleware[METHOD_NAME_ALL], path) || [];
      }
      Object.keys(middleware).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(middleware[m]).forEach((p) => {
            re.test(p) && middleware[m][p].push([handler, paramCount]);
          });
        }
      });
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          Object.keys(routes[m]).forEach(
            (p) => re.test(p) && routes[m][p].push([handler, paramCount])
          );
        }
      });
      return;
    }
    const paths = checkOptionalParameter(path) || [path];
    for (let i = 0, len = paths.length; i < len; i++) {
      const path2 = paths[i];
      Object.keys(routes).forEach((m) => {
        if (method === METHOD_NAME_ALL || method === m) {
          routes[m][path2] ||= [
            ...findMiddleware(middleware[m], path2) || findMiddleware(middleware[METHOD_NAME_ALL], path2) || []
          ];
          routes[m][path2].push([handler, paramCount - len + i + 1]);
        }
      });
    }
  }
  match = match;
  buildAllMatchers() {
    const matchers = /* @__PURE__ */ Object.create(null);
    Object.keys(this.#routes).concat(Object.keys(this.#middleware)).forEach((method) => {
      matchers[method] ||= this.#buildMatcher(method);
    });
    this.#middleware = this.#routes = void 0;
    clearWildcardRegExpCache();
    return matchers;
  }
  #buildMatcher(method) {
    const routes = [];
    let hasOwnRoute = method === METHOD_NAME_ALL;
    [this.#middleware, this.#routes].forEach((r) => {
      const ownRoute = r[method] ? Object.keys(r[method]).map((path) => [path, r[method][path]]) : [];
      if (ownRoute.length !== 0) {
        hasOwnRoute ||= true;
        routes.push(...ownRoute);
      } else if (method !== METHOD_NAME_ALL) {
        routes.push(
          ...Object.keys(r[METHOD_NAME_ALL]).map((path) => [path, r[METHOD_NAME_ALL][path]])
        );
      }
    });
    if (!hasOwnRoute) {
      return null;
    } else {
      return buildMatcherFromPreprocessedRoutes(routes);
    }
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/smart-router/router.js
var SmartRouter = class {
  static {
    __name(this, "SmartRouter");
  }
  name = "SmartRouter";
  #routers = [];
  #routes = [];
  constructor(init) {
    this.#routers = init.routers;
  }
  add(method, path, handler) {
    if (!this.#routes) {
      throw new Error(MESSAGE_MATCHER_IS_ALREADY_BUILT);
    }
    this.#routes.push([method, path, handler]);
  }
  match(method, path) {
    if (!this.#routes) {
      throw new Error("Fatal error");
    }
    const routers = this.#routers;
    const routes = this.#routes;
    const len = routers.length;
    let i = 0;
    let res;
    for (; i < len; i++) {
      const router = routers[i];
      try {
        for (let i2 = 0, len2 = routes.length; i2 < len2; i2++) {
          router.add(...routes[i2]);
        }
        res = router.match(method, path);
      } catch (e) {
        if (e instanceof UnsupportedPathError) {
          continue;
        }
        throw e;
      }
      this.match = router.match.bind(router);
      this.#routers = [router];
      this.#routes = void 0;
      break;
    }
    if (i === len) {
      throw new Error("Fatal error");
    }
    this.name = `SmartRouter + ${this.activeRouter.name}`;
    return res;
  }
  get activeRouter() {
    if (this.#routes || this.#routers.length !== 1) {
      throw new Error("No active router has been determined yet.");
    }
    return this.#routers[0];
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/trie-router/node.js
var emptyParams = /* @__PURE__ */ Object.create(null);
var Node2 = class _Node2 {
  static {
    __name(this, "_Node");
  }
  #methods;
  #children;
  #patterns;
  #order = 0;
  #params = emptyParams;
  constructor(method, handler, children) {
    this.#children = children || /* @__PURE__ */ Object.create(null);
    this.#methods = [];
    if (method && handler) {
      const m = /* @__PURE__ */ Object.create(null);
      m[method] = { handler, possibleKeys: [], score: 0 };
      this.#methods = [m];
    }
    this.#patterns = [];
  }
  insert(method, path, handler) {
    this.#order = ++this.#order;
    let curNode = this;
    const parts = splitRoutingPath(path);
    const possibleKeys = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const p = parts[i];
      const nextP = parts[i + 1];
      const pattern = getPattern(p, nextP);
      const key = Array.isArray(pattern) ? pattern[0] : p;
      if (key in curNode.#children) {
        curNode = curNode.#children[key];
        if (pattern) {
          possibleKeys.push(pattern[1]);
        }
        continue;
      }
      curNode.#children[key] = new _Node2();
      if (pattern) {
        curNode.#patterns.push(pattern);
        possibleKeys.push(pattern[1]);
      }
      curNode = curNode.#children[key];
    }
    curNode.#methods.push({
      [method]: {
        handler,
        possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
        score: this.#order
      }
    });
    return curNode;
  }
  #getHandlerSets(node, method, nodeParams, params) {
    const handlerSets = [];
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i];
      const handlerSet = m[method] || m[METHOD_NAME_ALL];
      const processedSet = {};
      if (handlerSet !== void 0) {
        handlerSet.params = /* @__PURE__ */ Object.create(null);
        handlerSets.push(handlerSet);
        if (nodeParams !== emptyParams || params && params !== emptyParams) {
          for (let i2 = 0, len2 = handlerSet.possibleKeys.length; i2 < len2; i2++) {
            const key = handlerSet.possibleKeys[i2];
            const processed = processedSet[handlerSet.score];
            handlerSet.params[key] = params?.[key] && !processed ? params[key] : nodeParams[key] ?? params?.[key];
            processedSet[handlerSet.score] = true;
          }
        }
      }
    }
    return handlerSets;
  }
  search(method, path) {
    const handlerSets = [];
    this.#params = emptyParams;
    const curNode = this;
    let curNodes = [curNode];
    const parts = splitPath(path);
    const curNodesQueue = [];
    for (let i = 0, len = parts.length; i < len; i++) {
      const part = parts[i];
      const isLast = i === len - 1;
      const tempNodes = [];
      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j];
        const nextNode = node.#children[part];
        if (nextNode) {
          nextNode.#params = node.#params;
          if (isLast) {
            if (nextNode.#children["*"]) {
              handlerSets.push(
                ...this.#getHandlerSets(nextNode.#children["*"], method, node.#params)
              );
            }
            handlerSets.push(...this.#getHandlerSets(nextNode, method, node.#params));
          } else {
            tempNodes.push(nextNode);
          }
        }
        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k];
          const params = node.#params === emptyParams ? {} : { ...node.#params };
          if (pattern === "*") {
            const astNode = node.#children["*"];
            if (astNode) {
              handlerSets.push(...this.#getHandlerSets(astNode, method, node.#params));
              astNode.#params = params;
              tempNodes.push(astNode);
            }
            continue;
          }
          const [key, name, matcher] = pattern;
          if (!part && !(matcher instanceof RegExp)) {
            continue;
          }
          const child = node.#children[key];
          const restPathString = parts.slice(i).join("/");
          if (matcher instanceof RegExp) {
            const m = matcher.exec(restPathString);
            if (m) {
              params[name] = m[0];
              handlerSets.push(...this.#getHandlerSets(child, method, node.#params, params));
              if (Object.keys(child.#children).length) {
                child.#params = params;
                const componentCount = m[0].match(/\//)?.length ?? 0;
                const targetCurNodes = curNodesQueue[componentCount] ||= [];
                targetCurNodes.push(child);
              }
              continue;
            }
          }
          if (matcher === true || matcher.test(part)) {
            params[name] = part;
            if (isLast) {
              handlerSets.push(...this.#getHandlerSets(child, method, params, node.#params));
              if (child.#children["*"]) {
                handlerSets.push(
                  ...this.#getHandlerSets(child.#children["*"], method, params, node.#params)
                );
              }
            } else {
              child.#params = params;
              tempNodes.push(child);
            }
          }
        }
      }
      curNodes = tempNodes.concat(curNodesQueue.shift() ?? []);
    }
    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score;
      });
    }
    return [handlerSets.map(({ handler, params }) => [handler, params])];
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/router/trie-router/router.js
var TrieRouter = class {
  static {
    __name(this, "TrieRouter");
  }
  name = "TrieRouter";
  #node;
  constructor() {
    this.#node = new Node2();
  }
  add(method, path, handler) {
    const results = checkOptionalParameter(path);
    if (results) {
      for (let i = 0, len = results.length; i < len; i++) {
        this.#node.insert(method, results[i], handler);
      }
      return;
    }
    this.#node.insert(method, path, handler);
  }
  match(method, path) {
    return this.#node.search(method, path);
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/hono.js
var Hono2 = class extends Hono {
  static {
    __name(this, "Hono");
  }
  /**
   * Creates an instance of the Hono class.
   *
   * @param options - Optional configuration options for the Hono instance.
   */
  constructor(options = {}) {
    super(options);
    this.router = options.router ?? new SmartRouter({
      routers: [new RegExpRouter(), new TrieRouter()]
    });
  }
};

// ../../node_modules/.pnpm/hono@4.11.9/node_modules/hono/dist/middleware/cors/index.js
var cors = /* @__PURE__ */ __name((options) => {
  const defaults = {
    origin: "*",
    allowMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH"],
    allowHeaders: [],
    exposeHeaders: []
  };
  const opts = {
    ...defaults,
    ...options
  };
  const findAllowOrigin = ((optsOrigin) => {
    if (typeof optsOrigin === "string") {
      if (optsOrigin === "*") {
        return () => optsOrigin;
      } else {
        return (origin) => optsOrigin === origin ? origin : null;
      }
    } else if (typeof optsOrigin === "function") {
      return optsOrigin;
    } else {
      return (origin) => optsOrigin.includes(origin) ? origin : null;
    }
  })(opts.origin);
  const findAllowMethods = ((optsAllowMethods) => {
    if (typeof optsAllowMethods === "function") {
      return optsAllowMethods;
    } else if (Array.isArray(optsAllowMethods)) {
      return () => optsAllowMethods;
    } else {
      return () => [];
    }
  })(opts.allowMethods);
  return /* @__PURE__ */ __name(async function cors2(c, next) {
    function set(key, value) {
      c.res.headers.set(key, value);
    }
    __name(set, "set");
    const allowOrigin = await findAllowOrigin(c.req.header("origin") || "", c);
    if (allowOrigin) {
      set("Access-Control-Allow-Origin", allowOrigin);
    }
    if (opts.credentials) {
      set("Access-Control-Allow-Credentials", "true");
    }
    if (opts.exposeHeaders?.length) {
      set("Access-Control-Expose-Headers", opts.exposeHeaders.join(","));
    }
    if (c.req.method === "OPTIONS") {
      if (opts.origin !== "*") {
        set("Vary", "Origin");
      }
      if (opts.maxAge != null) {
        set("Access-Control-Max-Age", opts.maxAge.toString());
      }
      const allowMethods = await findAllowMethods(c.req.header("origin") || "", c);
      if (allowMethods.length) {
        set("Access-Control-Allow-Methods", allowMethods.join(","));
      }
      let headers = opts.allowHeaders;
      if (!headers?.length) {
        const requestHeaders = c.req.header("Access-Control-Request-Headers");
        if (requestHeaders) {
          headers = requestHeaders.split(/\s*,\s*/);
        }
      }
      if (headers?.length) {
        set("Access-Control-Allow-Headers", headers.join(","));
        c.res.headers.append("Vary", "Access-Control-Request-Headers");
      }
      c.res.headers.delete("Content-Length");
      c.res.headers.delete("Content-Type");
      return new Response(null, {
        headers: c.res.headers,
        status: 204,
        statusText: "No Content"
      });
    }
    await next();
    if (opts.origin !== "*") {
      c.header("Vary", "Origin", { append: true });
    }
  }, "cors2");
}, "cors");

// src/settings.ts
function resolveVertical(s) {
  if (s.vertical && s.verticalConfig) {
    return { vertical: s.vertical, verticalConfig: s.verticalConfig };
  }
  if (s.eyebrow) {
    return {
      vertical: "eyebrow",
      verticalConfig: {
        consentText: s.eyebrow.consentText,
        repeat: s.eyebrow.repeat
      }
    };
  }
  return { vertical: "generic", verticalConfig: {} };
}
__name(resolveVertical, "resolveVertical");

// src/verticals/eyebrow.ts
var DEFAULT_REPEAT_TEMPLATE = "\u524D\u56DE\u306E\u3054\u6765\u5E97\u304B\u3089\u305D\u308D\u305D\u308D{interval}\u9031\u304C\u7D4C\u3061\u307E\u3059\u3002\u7709\u6BDB\u306E\u30EA\u30BF\u30C3\u30C1\u306F\u3044\u304B\u304C\u3067\u3057\u3087\u3046\u304B\uFF1F";
var STYLE_LABELS = {
  natural: "\u30CA\u30C1\u30E5\u30E9\u30EB",
  bold: "\u30DC\u30FC\u30EB\u30C9",
  sharp: "\u30B7\u30E3\u30FC\u30D7",
  korean: "\u97D3\u56FD\u98A8",
  feathering: "\u30D5\u30A7\u30B6\u30EA\u30F3\u30B0",
  custom: "\u30AB\u30B9\u30BF\u30E0"
};
function getStyleLabel(styleType) {
  if (!styleType) return "";
  return STYLE_LABELS[styleType] ?? styleType;
}
__name(getStyleLabel, "getStyleLabel");
function getRepeatConfig(settings) {
  const vc = settings?.verticalConfig?.repeat;
  if (vc && (vc.template || vc.intervalDays != null || vc.enabled != null)) {
    return {
      enabled: Boolean(vc.enabled),
      intervalDays: Number(vc.intervalDays) || 42,
      template: String(vc.template || DEFAULT_REPEAT_TEMPLATE)
    };
  }
  const eb = settings?.eyebrow?.repeat;
  if (eb) {
    return {
      enabled: Boolean(eb.enabled),
      intervalDays: Number(eb.intervalDays) || 42,
      template: String(eb.template || DEFAULT_REPEAT_TEMPLATE)
    };
  }
  return { enabled: false, intervalDays: 42, template: DEFAULT_REPEAT_TEMPLATE };
}
__name(getRepeatConfig, "getRepeatConfig");
function buildRepeatMessage(template, tokens) {
  return template.replace(/\{interval\}/g, tokens.interval).replace(/\{storeName\}/g, tokens.storeName).replace(/\{style\}/g, tokens.style).replace(/\{staff\}/g, tokens.staff).replace(/\{bookingUrl\}/g, tokens.bookingUrl);
}
__name(buildRepeatMessage, "buildRepeatMessage");
function eyebrowOnboardingChecks(opts) {
  return [
    {
      key: "menuEyebrow",
      label: "\u7709\u6BDB\u30B9\u30BF\u30A4\u30EB\u8A2D\u5B9A\u6E08\u307F\u30E1\u30CB\u30E5\u30FC\uFF081\u4EF6\u4EE5\u4E0A\uFF09",
      done: opts.menuEyebrowCount > 0,
      action: "/admin/menu",
      detail: opts.menuEyebrowCount > 0 ? `${opts.menuEyebrowCount}\u4EF6` : void 0
    },
    {
      key: "repeatConfig",
      label: "\u30EA\u30D4\u30FC\u30C8\u8A2D\u5B9A\uFF08\u6709\u52B9\u5316 + \u30C6\u30F3\u30D7\u30EC\u8A2D\u5B9A\uFF09",
      done: opts.repeatEnabled && opts.templateSet,
      action: "/admin/settings"
    }
  ];
}
__name(eyebrowOnboardingChecks, "eyebrowOnboardingChecks");

// src/durable/SlotLock.ts
var SlotLock = class {
  static {
    __name(this, "SlotLock");
  }
  constructor(state, _env) {
    this.state = state;
  }
  async fetch(request) {
    let url;
    try {
      url = new URL(request.url);
    } catch {
      url = new URL("https://invalid/");
    }
    if (url.pathname === "/__ping" && request.method === "GET") {
      return new Response("DO_OK", { status: 200 });
    }
    if (url.pathname === "/lock" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const key = String(body?.key ?? "");
      const ttl = Number(body?.ttlSeconds ?? 30);
      if (!key) return new Response(JSON.stringify({ ok: false, error: "missing_key" }), { status: 400 });
      const now = Date.now();
      const rec = await this.state.storage.get(key);
      if (rec && rec.until > now) {
        return new Response(JSON.stringify({ ok: false, error: "locked", until: rec.until }), { status: 409, headers: { "content-type": "application/json" } });
      }
      await this.state.storage.put(key, { until: now + ttl * 1e3 });
      return new Response(JSON.stringify({ ok: true, key, ttlSeconds: ttl }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/unlock" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const key = String(body?.key ?? "");
      if (!key) return new Response(JSON.stringify({ ok: false, error: "missing_key" }), { status: 400 });
      await this.state.storage.delete(key);
      return new Response(JSON.stringify({ ok: true, key }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "not_found", path: url.pathname, method: request.method }), { status: 404, headers: { "content-type": "application/json" } });
  }
};

// src/index.ts
var sleep = /* @__PURE__ */ __name((ms) => new Promise((r) => setTimeout(r, ms)), "sleep");
var app = new Hono2();
app.use("/*", cors({
  origin: /* @__PURE__ */ __name((origin, c) => {
    if (!origin) return null;
    const env2 = c.env;
    const staticOrigins = ["http://localhost:3000", "http://127.0.0.1:3000"];
    if (staticOrigins.includes(origin)) return origin;
    const webBase = env2?.ADMIN_WEB_BASE;
    if (webBase) {
      try {
        if (origin === new URL(webBase).origin) return origin;
      } catch {
      }
    }
    const extraOrigins = env2?.ADMIN_ALLOWED_ORIGINS;
    if (extraOrigins) {
      const list = extraOrigins.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.includes(origin)) return origin;
    }
    if (!origin.startsWith("https://")) return null;
    const suffix = env2?.PAGES_DEV_ALLOWED_SUFFIX;
    if (suffix && origin.endsWith(".pages.dev")) {
      if (origin.endsWith(suffix)) return origin;
      return null;
    }
    if (env2?.ALLOW_PAGES_DEV_WILDCARD === "1" && origin.endsWith(".pages.dev")) {
      return origin;
    }
    return null;
  }, "origin"),
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Admin-Token"],
  credentials: true
}));
app.use("/admin/*", async (c, next) => {
  const env2 = c.env;
  const expected = env2?.ADMIN_TOKEN;
  const requireToken = env2?.REQUIRE_ADMIN_TOKEN === "1";
  if (!expected) {
    if (requireToken) {
      console.error("[auth] REQUIRE_ADMIN_TOKEN=1 \u3060\u304C ADMIN_TOKEN \u304C\u672A\u8A2D\u5B9A\u3002/admin/* \u3092\u30D6\u30ED\u30C3\u30AF\u3002");
      return c.json({ ok: false, error: "Service misconfigured: admin token not set" }, 503);
    }
    console.warn("[auth] ADMIN_TOKEN \u672A\u8A2D\u5B9A\u3002/admin/* \u304C\u7121\u9632\u5099\u3002wrangler secret put ADMIN_TOKEN \u3067\u8A2D\u5B9A\u3092\u3002");
    return next();
  }
  const provided = c.req.header("X-Admin-Token");
  if (!provided || provided !== expected) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }
  return next();
});
function getTenantId(c, body) {
  try {
    const url = new URL(c.req.url);
    return url.searchParams.get("tenantId") ?? (body?.tenantId ?? null) ?? c.req.header("x-tenant-id") ?? "default";
  } catch {
    return body?.tenantId ?? null ?? c.req.header("x-tenant-id") ?? "default";
  }
}
__name(getTenantId, "getTenantId");
app.get("/__build", (c) => c.json({ ok: true, stamp: "API_BUILD_V1" }));
app.get("/admin/settings", async (c) => {
  const debug = c.req.query("debug") === "1";
  const tenantId = (c.req.query("tenantId") || c.req.header("x-tenant-id") || "default").trim() || "default";
  const envAny = c.env || c;
  const kv = envAny && (envAny.SAAS_FACTORY || envAny.KV || envAny.SAAS_FACTORY_KV) || null;
  if (!kv) {
    return c.json({ ok: false, error: "kv_binding_missing", tenantId, seen: Object.keys(envAny || {}) }, 500);
  }
  const DEFAULT_SETTINGS2 = {
    businessName: "Default Shop",
    slotMinutes: 30,
    timezone: "Asia/Tokyo",
    closedWeekdays: [],
    openTime: "10:00",
    closeTime: "19:00",
    slotIntervalMin: 30,
    storeAddress: "",
    consentText: "\u4E88\u7D04\u5185\u5BB9\u3092\u78BA\u8A8D\u3057\u3001\u540C\u610F\u306E\u4E0A\u3067\u4E88\u7D04\u3092\u78BA\u5B9A\u3057\u307E\u3059",
    staffSelectionEnabled: true
  };
  const deepMerge2 = /* @__PURE__ */ __name((a, b) => {
    const out = Array.isArray(a) ? [...a] : { ...a || {} };
    for (const k of Object.keys(b || {})) {
      const av = out[k];
      const bv = b[k];
      if (av && bv && typeof av === "object" && typeof bv === "object" && !Array.isArray(av) && !Array.isArray(bv)) {
        out[k] = deepMerge2(av, bv);
      } else {
        out[k] = bv;
      }
    }
    return out;
  }, "deepMerge");
  const getJson = /* @__PURE__ */ __name(async (key) => {
    try {
      const v = await kv.get(key, "json");
      return v || null;
    } catch (e) {
      try {
        const v2 = await kv.get(key);
        return v2 ? JSON.parse(v2) : null;
      } catch (_) {
        return null;
      }
    }
  }, "getJson");
  const keyDefault = "settings:default";
  const keyTenant = "settings:" + tenantId;
  const sDefault = await getJson(keyDefault);
  const sTenant = tenantId === "default" ? null : await getJson(keyTenant);
  let data = DEFAULT_SETTINGS2;
  if (sDefault) data = deepMerge2(data, sDefault);
  if (sTenant) data = deepMerge2(data, sTenant);
  const { vertical, verticalConfig } = resolveVertical(data);
  data = { ...data, vertical, verticalConfig };
  return c.json({
    ok: true,
    tenantId,
    data,
    debug: debug ? { keyDefault, keyTenant, hasDefault: !!sDefault, hasTenant: !!sTenant } : void 0
  });
});
app.put("/admin/settings", async (c) => {
  const tenantId = (c.req.query("tenantId") || c.req.header("x-tenant-id") || "default").trim() || "default";
  const envAny = c.env || c;
  const kv = envAny && (envAny.SAAS_FACTORY || envAny.KV || envAny.SAAS_FACTORY_KV) || null;
  if (!kv) {
    return c.json({ ok: false, error: "kv_binding_missing", tenantId, seen: Object.keys(envAny || {}) }, 500);
  }
  let body = null;
  try {
    body = await c.req.json();
  } catch (e) {
    return c.json({ ok: false, error: "bad_json" }, 400);
  }
  const normTime = /* @__PURE__ */ __name((s, fallback) => {
    const v = String(s ?? fallback);
    return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
  }, "normTime");
  const patch = {};
  if (body.storeName != null) patch.storeName = String(body.storeName);
  if (body.storeAddress != null) patch.storeAddress = String(body.storeAddress);
  if (body.consentText != null) patch.consentText = String(body.consentText);
  if (body.staffSelectionEnabled != null) patch.staffSelectionEnabled = Boolean(body.staffSelectionEnabled);
  if (body.businessName != null) patch.businessName = String(body.businessName);
  if (body.timezone != null) patch.timezone = String(body.timezone);
  if (body.openTime != null) patch.openTime = normTime(body.openTime, "10:00");
  if (body.closeTime != null) patch.closeTime = normTime(body.closeTime, "19:00");
  if (body.slotIntervalMin != null) patch.slotIntervalMin = Number(body.slotIntervalMin);
  if (body.slotMinutes != null) patch.slotMinutes = Number(body.slotMinutes);
  if (body.closedWeekdays != null) {
    patch.closedWeekdays = Array.isArray(body.closedWeekdays) ? body.closedWeekdays.map((x) => Number(x)) : [];
  }
  if (body.publicDays != null) patch.publicDays = Number(body.publicDays);
  if (body.tenant != null && typeof body.tenant === "object") patch.tenant = body.tenant;
  if (body.businessHours != null && typeof body.businessHours === "object") patch.businessHours = body.businessHours;
  if (body.rules != null && typeof body.rules === "object") patch.rules = body.rules;
  if (body.notifications != null && typeof body.notifications === "object") patch.notifications = body.notifications;
  if (body.assignment != null && typeof body.assignment === "object") patch.assignment = body.assignment;
  if (body.exceptions != null && Array.isArray(body.exceptions)) patch.exceptions = body.exceptions;
  const key = "settings:" + tenantId;
  let existing = {};
  try {
    const ev = await kv.get(key, "json");
    if (ev && typeof ev === "object") existing = ev;
  } catch {
    try {
      const s = await kv.get(key);
      if (s) existing = JSON.parse(s);
    } catch {
    }
  }
  if (body.integrations != null && typeof body.integrations === "object") {
    const existingInteg = existing.integrations || {};
    const bodyInteg = body.integrations;
    patch.integrations = { ...existingInteg };
    if (bodyInteg.line != null && typeof bodyInteg.line === "object") {
      patch.integrations.line = { ...existingInteg.line || {}, ...bodyInteg.line };
    }
    if (bodyInteg.stripe != null && typeof bodyInteg.stripe === "object") {
      patch.integrations.stripe = { ...existingInteg.stripe || {}, ...bodyInteg.stripe };
    }
  }
  if (body.onboarding != null && typeof body.onboarding === "object") {
    patch.onboarding = { ...existing.onboarding || {}, ...body.onboarding };
  }
  if (body.eyebrow != null && typeof body.eyebrow === "object") {
    const existingEyebrow = existing.eyebrow || {};
    patch.eyebrow = { ...existingEyebrow, ...body.eyebrow };
    if (body.eyebrow.repeat != null && typeof body.eyebrow.repeat === "object") {
      patch.eyebrow.repeat = { ...existingEyebrow.repeat || {}, ...body.eyebrow.repeat };
    }
    if (body.vertical == null && body.verticalConfig == null) {
      patch.vertical = "eyebrow";
      patch.verticalConfig = {
        consentText: patch.eyebrow.consentText,
        repeat: patch.eyebrow.repeat
      };
    }
  }
  if (body.vertical != null) patch.vertical = String(body.vertical);
  if (body.verticalConfig != null && typeof body.verticalConfig === "object") {
    const existingVC = existing.verticalConfig || {};
    patch.verticalConfig = { ...existingVC, ...body.verticalConfig };
    if (body.verticalConfig.repeat != null && typeof body.verticalConfig.repeat === "object") {
      patch.verticalConfig.repeat = { ...existingVC.repeat || {}, ...body.verticalConfig.repeat };
    }
  }
  const merged = { ...existing, ...patch };
  await kv.put(key, JSON.stringify(merged));
  return c.json({ ok: true, tenantId, key, saved: merged });
});
app.get("/slots", async (c) => {
  const debug = c.req.query("debug") === "1";
  const tenantId = (c.req.query("tenantId") || c.req.header("x-tenant-id") || "default").trim() || "default";
  const staffId = (c.req.query("staffId") || "any").trim() || "any";
  const date = (c.req.query("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ ok: false, error: "bad_date", hint: "YYYY-MM-DD", tenantId, staffId, date }, 400);
  }
  const envAny = c.env || c;
  const pickFirst = /* @__PURE__ */ __name((obj, keys) => {
    for (const k of keys) if (obj && obj[k]) return obj[k];
    return null;
  }, "pickFirst");
  const kv = pickFirst(envAny, ["KV", "SAAS_FACTORY_KV", "SAAS_FACTORY", "APP_KV", "DATA_KV", "BOOKING_KV"]);
  const db = pickFirst(envAny, ["DB", "D1", "DATABASE", "SAAS_FACTORY_DB", "BOOKING_DB"]);
  if (!kv) {
    return c.json({ ok: false, error: "kv_binding_missing", tenantId, seen: Object.keys(envAny || {}), hint: "Check wrangler.toml bindings" }, 500);
  }
  if (!db) {
    return c.json({ ok: false, error: "d1_binding_missing", tenantId, seen: Object.keys(envAny || {}), hint: "Check wrangler.toml bindings" }, 500);
  }
  const pad2 = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad2");
  const JST_OFFSET_MS = 9 * 60 * 60 * 1e3;
  const jstDate = /* @__PURE__ */ __name((tms) => new Date(tms + JST_OFFSET_MS), "jstDate");
  const parseHHMM = /* @__PURE__ */ __name((s2) => {
    const m = /^(\d{2}):(\d{2})$/.exec(s2);
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return { hh, mm };
  }, "parseHHMM");
  const toIsoJst = /* @__PURE__ */ __name((d, hhmm) => d + "T" + hhmm + ":00+09:00", "toIsoJst");
  const ms = /* @__PURE__ */ __name((iso) => new Date(iso).getTime(), "ms");
  const overlaps = /* @__PURE__ */ __name((a0, a1, b0, b1) => a0 < b1 && a1 > b0, "overlaps");
  const DEFAULT_SETTINGS2 = {
    businessName: "Default Shop",
    slotMinutes: 30,
    timezone: "Asia/Tokyo",
    closedWeekdays: [],
    openTime: "10:00",
    closeTime: "19:00",
    slotIntervalMin: 30
  };
  const deepMerge2 = /* @__PURE__ */ __name((a, b) => {
    const out = Array.isArray(a) ? [...a] : { ...a || {} };
    for (const k of Object.keys(b || {})) {
      const av = out[k];
      const bv = b[k];
      if (av && bv && typeof av === "object" && typeof bv === "object" && !Array.isArray(av) && !Array.isArray(bv)) {
        out[k] = deepMerge2(av, bv);
      } else {
        out[k] = bv;
      }
    }
    return out;
  }, "deepMerge");
  const getJson = /* @__PURE__ */ __name(async (key) => {
    try {
      const v = await kv.get(key, "json");
      return v || null;
    } catch (e) {
      try {
        const v2 = await kv.get(key);
        return v2 ? JSON.parse(v2) : null;
      } catch (_) {
        return null;
      }
    }
  }, "getJson");
  const candidatesDefault = [
    "admin:settings:default",
    "settings:default",
    "admin:settings",
    "settings"
  ];
  const candidatesTenant = [
    "admin:settings:" + tenantId,
    "settings:" + tenantId,
    "admin:settings:tenant:" + tenantId,
    "settings:tenant:" + tenantId
  ];
  let s = DEFAULT_SETTINGS2;
  let sDefault = null;
  let sTenant = null;
  let hitDefaultKey = null;
  let hitTenantKey = null;
  for (const k of candidatesDefault) {
    sDefault = await getJson(k);
    if (sDefault) {
      hitDefaultKey = k;
      break;
    }
  }
  if (tenantId !== "default") {
    for (const k of candidatesTenant) {
      sTenant = await getJson(k);
      if (sTenant) {
        hitTenantKey = k;
        break;
      }
    }
  }
  if (sDefault) s = deepMerge2(s, sDefault);
  if (sTenant) s = deepMerge2(s, sTenant);
  const openTime = String(s.openTime || "10:00");
  const closeTime = String(s.closeTime || "19:00");
  const slotIntervalMin = Number(s.slotIntervalMin ?? s.slotMinutes ?? 30);
  const slotMinutes = Number(s.slotMinutes ?? 30);
  const closedWeekdays = Array.isArray(s.closedWeekdays) ? s.closedWeekdays.map((x) => Number(x)) : [];
  const o = parseHHMM(openTime);
  const cc = parseHHMM(closeTime);
  if (!o || !cc) {
    return c.json({ ok: false, error: "bad_settings_time", tenantId, openTime, closeTime }, 500);
  }
  const weekday = jstDate(ms(date + "T00:00:00+09:00")).getUTCDay();
  if (closedWeekdays.includes(weekday)) {
    return c.json({
      ok: true,
      tenantId,
      staffId,
      date,
      settings: debug ? { openTime, closeTime, slotIntervalMin, slotMinutes, closedWeekdays, weekday, hitDefaultKey, hitTenantKey } : void 0,
      slots: []
    });
  }
  const openIso = toIsoJst(date, pad2(o.hh) + ":" + pad2(o.mm));
  const closeIso = toIsoJst(date, pad2(cc.hh) + ":" + pad2(cc.mm));
  const openMs = ms(openIso);
  const closeMs = ms(closeIso);
  const stepMs = slotIntervalMin * 60 * 1e3;
  const durMs = slotMinutes * 60 * 1e3;
  const dayStart = date + "T00:00:00+09:00";
  const dayEnd = date + "T23:59:59+09:00";
  let reservations = [];
  try {
    if (staffId === "any") {
      const q = await db.prepare(`SELECT start_at, end_at, staff_id FROM reservations WHERE tenant_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at`).bind(tenantId, dayEnd, dayStart).all();
      reservations = q.results || [];
    } else {
      const q = await db.prepare(`SELECT start_at, end_at, staff_id FROM reservations WHERE tenant_id = ? AND staff_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at`).bind(tenantId, staffId, dayEnd, dayStart).all();
      reservations = q.results || [];
    }
  } catch (e) {
    return c.json({ ok: false, error: "d1_query_failed", tenantId, detail: String(e?.message || e), stack: debug ? String(e?.stack || "") : void 0 }, 500);
  }
  const resAll = reservations.map((r) => ({ a0: ms(r.start_at), a1: ms(r.end_at), sid: String(r.staff_id || "any") })).filter((x) => Number.isFinite(x.a0) && Number.isFinite(x.a1));
  const resByStaff = {};
  for (const r of resAll) {
    if (!resByStaff[r.sid]) resByStaff[r.sid] = [];
    resByStaff[r.sid].push(r);
  }
  let singleAvail = {};
  let allStaffAvail = {};
  let activeStaffIds = [];
  if (staffId !== "any") {
    try {
      const raw2 = await kv.get(`availability:${tenantId}:${staffId}:${date}`);
      if (raw2) singleAvail = JSON.parse(raw2);
    } catch {
    }
  } else {
    try {
      const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
      const allStaff = staffRaw ? JSON.parse(staffRaw) : [];
      activeStaffIds = allStaff.filter((s2) => s2.active !== false).map((s2) => String(s2.id));
      for (const sid of activeStaffIds) {
        try {
          const raw2 = await kv.get(`availability:${tenantId}:${sid}:${date}`);
          if (raw2) allStaffAvail[sid] = JSON.parse(raw2);
        } catch {
        }
      }
    } catch {
    }
  }
  const slots = [];
  for (let t = openMs; t + durMs <= closeMs; t += stepMs) {
    const end = t + durMs;
    const dt = jstDate(t);
    const time = pad2(dt.getUTCHours()) + ":" + pad2(dt.getUTCMinutes());
    let available = true;
    let status = "available";
    if (staffId !== "any") {
      for (const r of resAll) {
        if (overlaps(t, end, r.a0, r.a1)) {
          available = false;
          break;
        }
      }
      const ovr = singleAvail[time];
      if (available && ovr === "closed") available = false;
      if (!available) status = "full";
      else if (ovr === "half") status = "few";
      else status = "available";
    } else {
      if (activeStaffIds.length === 0) {
        for (const r of resAll) {
          if (overlaps(t, end, r.a0, r.a1)) {
            available = false;
            break;
          }
        }
        status = available ? "available" : "full";
      } else {
        let anyConflictCount = 0;
        for (const r of resByStaff["any"] || []) {
          if (overlaps(t, end, r.a0, r.a1)) anyConflictCount++;
        }
        const staffStatuses = [];
        for (const sid of activeStaffIds) {
          let ownConflict = false;
          for (const r of resByStaff[sid] || []) {
            if (overlaps(t, end, r.a0, r.a1)) {
              ownConflict = true;
              break;
            }
          }
          if (ownConflict) continue;
          const ovr = (allStaffAvail[sid] || {})[time];
          if (ovr === "closed") continue;
          staffStatuses.push(ovr === "half" ? "few" : "available");
        }
        const remainingCount = staffStatuses.length - anyConflictCount;
        if (remainingCount <= 0) {
          available = false;
          status = "full";
        } else {
          available = true;
          const sorted = staffStatuses.slice().sort((a, b) => a === b ? 0 : a === "available" ? -1 : 1);
          const remaining = sorted.slice(anyConflictCount);
          status = remaining.some((s2) => s2 === "available") ? "available" : "few";
        }
      }
    }
    slots.push({ time, available, status });
  }
  return c.json({
    ok: true,
    tenantId,
    staffId,
    date,
    settings: debug ? { openTime, closeTime, slotIntervalMin, slotMinutes, closedWeekdays, weekday, hitDefaultKey, hitTenantKey } : void 0,
    slots
  });
});
app.get("/slots__legacy", async (c) => {
  const debug = (c.req.query("debug") || "") === "1";
  try {
    const tenantId = c.req.query("tenantId") || "default";
    const staffIdQ = c.req.query("staffId") || "any";
    const dateStr = c.req.query("date") || "";
    let y, m, d;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [yy, mm, dd] = dateStr.split("-").map((v) => Number(v));
      y = yy;
      m = mm;
      d = dd;
    } else {
      const now = /* @__PURE__ */ new Date();
      y = now.getFullYear();
      m = now.getMonth() + 1;
      d = now.getDate();
    }
    const pad2 = /* @__PURE__ */ __name((n) => String(n).padStart(2, "0"), "pad2");
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    const tz = "+09:00";
    const settingsUrl = new URL("/admin/settings", "http://local");
    settingsUrl.searchParams.set("tenantId", tenantId);
    const settingsRes = await fetch(settingsUrl.toString().replace("http://local", c.req.url.split("/").slice(0, 3).join("/")), {
      method: "GET",
      headers: { "Accept": "application/json" }
    });
    let openTime = "10:00";
    let closeTime = "16:00";
    let slotIntervalMin = 30;
    if (settingsRes.ok) {
      const raw2 = await settingsRes.json().catch(() => null);
      const s = raw2?.data ?? raw2;
      if (s?.openTime) openTime = String(s.openTime);
      if (s?.closeTime) closeTime = String(s.closeTime);
      if (s?.slotIntervalMin) slotIntervalMin = Number(s.slotIntervalMin) || slotIntervalMin;
    }
    const toMin = /* @__PURE__ */ __name((hhmm) => {
      const m2 = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
      if (!m2) return null;
      return Number(m2[1]) * 60 + Number(m2[2]);
    }, "toMin");
    const openMin = toMin(openTime) ?? 10 * 60;
    const closeMin = toMin(closeTime) ?? 16 * 60;
    const step = Math.max(5, Math.min(120, slotIntervalMin || 30));
    const prefix = `${date}T`;
    const like = `${prefix}%`;
    let rows = [];
    if (staffIdQ && staffIdQ !== "any") {
      const q2 = `
        SELECT slot_start
        FROM reservations
        WHERE tenant_id = ?
          AND status = 'active'
          AND slot_start LIKE ?
          AND staff_id = ?
      `;
      const r = await c.env.DB.prepare(q2).bind(tenantId, like, staffIdQ).all();
      rows = r && Array.isArray(r.results) ? r.results : [];
    } else {
      const q = `
        SELECT slot_start
        FROM reservations
        WHERE tenant_id = ?
          AND status = 'active'
          AND slot_start LIKE ?
      `;
      const r = await c.env.DB.prepare(q).bind(tenantId, like).all();
      rows = r && Array.isArray(r.results) ? r.results : [];
    }
    const reserved = new Set(rows.map((x) => String(x.slot_start)));
    const slots = [];
    for (let t = openMin; t + step <= closeMin; t += step) {
      const hh = Math.floor(t / 60);
      const mm = t % 60;
      const time = `${pad2(hh)}:${pad2(mm)}`;
      const slotStart = `${date}T${time}:00${tz}`;
      const isReserved = reserved.has(slotStart);
      slots.push({
        time,
        available: !isReserved,
        reason: isReserved ? "reserved" : void 0,
        meta: debug ? { slotStart, source: "dummy_v6_settings" } : void 0
      });
    }
    return c.json({
      ok: true,
      tenantId,
      staffId: staffIdQ,
      date,
      slots,
      debug: debug ? { openTime, closeTime, slotIntervalMin: step, reservedCount: reserved.size } : void 0
    });
  } catch (e) {
    return c.json({
      ok: false,
      error: "slots_error",
      message: String(e?.message || e),
      stack: debug ? String(e?.stack || "") : void 0
    }, 500);
  }
});
app.get("/ping", (c) => c.text("pong"));
app.get("/media/menu/*", async (c) => {
  try {
    const r2 = c.env.MENU_IMAGES;
    if (!r2) return new Response("R2 not configured", { status: 503 });
    const url = new URL(c.req.url);
    const imageKey = decodeURIComponent(url.pathname.replace(/^\/media\/menu\//, ""));
    if (!imageKey) return new Response("Not Found", { status: 404 });
    const obj = await r2.get(imageKey);
    if (!obj) return new Response("Not Found", { status: 404 });
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (obj.etag) headers.set("ETag", `"${obj.etag}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    return new Response("Server Error", { status: 500 });
  }
});
app.get("/__debug/do", async (c) => {
  const name = c.req.query("name") || "default";
  const id = c.env.SLOT_LOCK.idFromName(name);
  const stub = c.env.SLOT_LOCK.get(id);
  const res = await stub.fetch("http://slot-lock/__ping");
  const text = await res.text();
  return c.json({ ok: true, name, status: res.status, body: text });
});
function defaultMenu() {
  return [
    { id: "cut", name: "\u30AB\u30C3\u30C8", price: 5e3, durationMin: 60, active: true, sortOrder: 1 },
    { id: "color", name: "\u30AB\u30E9\u30FC", price: 8e3, durationMin: 90, active: true, sortOrder: 2 },
    { id: "perm", name: "\u30D1\u30FC\u30DE", price: 1e4, durationMin: 120, active: true, sortOrder: 3 }
  ];
}
__name(defaultMenu, "defaultMenu");
app.get("/admin/menu", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const key = `admin:menu:list:${tenantId}`;
    const value = await kv.get(key);
    if (value) {
      const menu = JSON.parse(value);
      return c.json({ ok: true, tenantId, data: menu });
    }
    return c.json({ ok: true, tenantId, data: defaultMenu() });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch menu", message: String(error) }, 500);
  }
});
app.post("/admin/menu/image", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const menuId = (c.req.query("menuId") || "new").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const r2 = c.env.MENU_IMAGES;
    if (!r2) return c.json({ ok: false, error: "R2_not_bound" }, 500);
    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ ok: false, error: "invalid_form_data" }, 400);
    const file = formData.get("file");
    if (!file) return c.json({ ok: false, error: "missing_file_field" }, 400);
    if (file.size > 3 * 1024 * 1024) {
      return c.json({ ok: false, error: "file_too_large", maxBytes: 3145728 }, 413);
    }
    const contentType = file.type || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return c.json({ ok: false, error: "invalid_file_type", got: contentType }, 400);
    }
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const rand = Math.random().toString(36).slice(2, 9);
    const imageKey = `menu-images/${tenantId}/${menuId}/${Date.now()}-${rand}.${ext}`;
    const buf = await file.arrayBuffer();
    await r2.put(imageKey, buf, { httpMetadata: { contentType } });
    const reqUrl = new URL(c.req.url);
    const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
    const imageUrl = `${apiBase}/media/menu/${imageKey}`;
    return c.json({ ok: true, tenantId, menuId, imageKey, imageUrl });
  } catch (err) {
    return c.json({ ok: false, error: "upload_failed", message: String(err?.message ?? err) }, 500);
  }
});
app.get("/media/reservations/*", async (c) => {
  try {
    const r2 = c.env.MENU_IMAGES;
    if (!r2) return new Response("R2 not configured", { status: 503 });
    const url = new URL(c.req.url);
    const imageKey = decodeURIComponent(url.pathname.replace(/^\/media\/reservations\//, ""));
    if (!imageKey) return new Response("Not Found", { status: 404 });
    const obj = await r2.get(imageKey);
    if (!obj) return new Response("Not Found", { status: 404 });
    const headers = new Headers();
    headers.set("Content-Type", obj.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    if (obj.etag) headers.set("ETag", `"${obj.etag}"`);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(obj.body, { status: 200, headers });
  } catch (err) {
    return new Response("Server Error", { status: 500 });
  }
});
app.post("/admin/reservations/:id/image", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const kind = (c.req.query("kind") || "before").replace(/[^a-zA-Z0-9_\-]/g, "_");
    const r2 = c.env.MENU_IMAGES;
    if (!r2) return c.json({ ok: false, error: "R2_not_bound" }, 500);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const formData = await c.req.formData().catch(() => null);
    if (!formData) return c.json({ ok: false, error: "invalid_form_data" }, 400);
    const file = formData.get("file");
    if (!file) return c.json({ ok: false, error: "missing_file_field" }, 400);
    if (file.size > 3 * 1024 * 1024) {
      return c.json({ ok: false, error: "file_too_large", maxBytes: 3145728 }, 413);
    }
    const contentType = file.type || "application/octet-stream";
    if (!contentType.startsWith("image/")) {
      return c.json({ ok: false, error: "invalid_file_type", got: contentType }, 400);
    }
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const rand = Math.random().toString(36).slice(2, 9);
    const imageKey = `tenants/${tenantId}/reservations/${id}/${kind}-${Date.now()}-${rand}.${ext}`;
    const buf = await file.arrayBuffer();
    await r2.put(imageKey, buf, { httpMetadata: { contentType } });
    const reqUrl = new URL(c.req.url);
    const apiBase = `${reqUrl.protocol}//${reqUrl.host}`;
    const imageUrl = `${apiBase}/media/reservations/${imageKey}`;
    const existingRow = await db.prepare("SELECT meta FROM reservations WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first().catch(() => null);
    let existingMeta = {};
    if (existingRow?.meta) {
      try {
        existingMeta = JSON.parse(existingRow.meta);
      } catch {
      }
    }
    const metaKey = kind === "after" ? "afterUrl" : "beforeUrl";
    const mergedMeta = { ...existingMeta, [metaKey]: imageUrl };
    await db.prepare("UPDATE reservations SET meta = ? WHERE id = ? AND tenant_id = ?").bind(JSON.stringify(mergedMeta), id, tenantId).run();
    return c.json({ ok: true, tenantId, reservationId: id, kind, imageKey, imageUrl });
  } catch (err) {
    return c.json({ ok: false, error: "upload_failed", message: String(err?.message ?? err) }, 500);
  }
});
app.post("/admin/menu", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json().catch(() => ({}));
    const { name, price, durationMin, active, sortOrder } = body ?? {};
    if (!name || typeof name !== "string" || name.trim() === "") {
      return c.json({ ok: false, error: "name is required" }, 400);
    }
    if (price === void 0 || typeof price !== "number" || price < 0) {
      return c.json({ ok: false, error: "price must be non-negative number" }, 400);
    }
    if (durationMin === void 0 || typeof durationMin !== "number" || durationMin <= 0) {
      return c.json({ ok: false, error: "durationMin must be positive number" }, 400);
    }
    if (active !== void 0 && typeof active !== "boolean") {
      return c.json({ ok: false, error: "active must be boolean" }, 400);
    }
    if (sortOrder !== void 0 && (typeof sortOrder !== "number" || sortOrder < 0)) {
      return c.json({ ok: false, error: "sortOrder must be non-negative number" }, 400);
    }
    const key = `admin:menu:list:${tenantId}`;
    const value = await kv.get(key);
    const seed = defaultMenu();
    const menu = value ? JSON.parse(value) : seed;
    const eyebrow = body?.eyebrow && typeof body.eyebrow === "object" ? body.eyebrow : void 0;
    const bodyId = typeof body?.id === "string" && body.id.trim() ? body.id.trim() : void 0;
    const existingIdx = bodyId ? menu.findIndex((m) => m.id === bodyId) : -1;
    if (existingIdx >= 0) {
      const existing = menu[existingIdx];
      const updated = {
        ...existing,
        name: name.trim(),
        price,
        durationMin,
        active: active !== void 0 ? active : existing.active,
        sortOrder: sortOrder !== void 0 ? sortOrder : existing.sortOrder
      };
      if (eyebrow !== void 0) updated.eyebrow = eyebrow;
      else if ("eyebrow" in body && body.eyebrow === null) delete updated.eyebrow;
      if (body.imageKey != null) {
        if (body.imageKey) updated.imageKey = String(body.imageKey);
        else delete updated.imageKey;
      }
      if (body.imageUrl != null) {
        if (body.imageUrl) updated.imageUrl = String(body.imageUrl);
        else delete updated.imageUrl;
      }
      menu[existingIdx] = updated;
      await kv.put(key, JSON.stringify(menu));
      return c.json({ ok: true, tenantId, data: updated });
    }
    const id = `menu_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newItem = {
      id,
      name: name.trim(),
      price,
      durationMin,
      active: active !== void 0 ? active : true,
      sortOrder: sortOrder !== void 0 ? sortOrder : menu.length
    };
    if (eyebrow !== void 0) newItem.eyebrow = eyebrow;
    if (body.imageKey) newItem.imageKey = String(body.imageKey);
    if (body.imageUrl) newItem.imageUrl = String(body.imageUrl);
    menu.push(newItem);
    await kv.put(key, JSON.stringify(menu));
    return c.json({ ok: true, tenantId, data: newItem }, 201);
  } catch (error) {
    return c.json({ ok: false, error: "Failed to create menu", message: String(error) }, 500);
  }
});
app.patch("/admin/menu/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const itemId = c.req.param("id");
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json().catch(() => ({}));
    const key = `admin:menu:list:${tenantId}`;
    const raw2 = await kv.get(key);
    const menu = raw2 ? JSON.parse(raw2) : [];
    const idx = menu.findIndex((m) => m.id === itemId);
    if (idx < 0) return c.json({ ok: false, error: "menu_item_not_found" }, 404);
    const existing = menu[idx];
    const updated = { ...existing };
    if (body.name !== void 0) updated.name = String(body.name).trim();
    if (body.price !== void 0) updated.price = Number(body.price);
    if (body.durationMin !== void 0) updated.durationMin = Number(body.durationMin);
    if (body.active !== void 0) updated.active = Boolean(body.active);
    if (body.sortOrder !== void 0) updated.sortOrder = Number(body.sortOrder);
    if (body.eyebrow !== void 0) {
      if (body.eyebrow === null) delete updated.eyebrow;
      else updated.eyebrow = body.eyebrow;
    }
    if (body.imageKey !== void 0) {
      if (!body.imageKey) delete updated.imageKey;
      else updated.imageKey = String(body.imageKey);
    }
    if (body.imageUrl !== void 0) {
      if (!body.imageUrl) delete updated.imageUrl;
      else updated.imageUrl = String(body.imageUrl);
    }
    menu[idx] = updated;
    await kv.put(key, JSON.stringify(menu));
    return c.json({ ok: true, tenantId, data: updated });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to update menu", message: String(error) }, 500);
  }
});
app.get("/admin/staff", async (c) => {
  const tenantId = c.req.query("tenantId") || "default";
  const key = `admin:staff:list:${tenantId}`;
  const raw2 = await c.env.SAAS_FACTORY.get(key);
  const data = raw2 ? JSON.parse(raw2) : [];
  return c.json({ ok: true, tenantId, data });
});
app.post("/admin/staff", async (c) => {
  const tenantId = c.req.query("tenantId") || "default";
  const key = `admin:staff:list:${tenantId}`;
  const body = await c.req.json();
  const raw2 = await c.env.SAAS_FACTORY.get(key);
  const list = raw2 ? JSON.parse(raw2) : [];
  const id = body?.id || `staff_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const item = { ...body, id };
  const next = [item, ...list];
  await c.env.SAAS_FACTORY.put(key, JSON.stringify(next));
  return c.json({ ok: true, tenantId, data: item });
});
app.all("/admin/staff/:id", async (c) => {
  const tenantId = c.req.query("tenantId") || "default";
  const key = `admin:staff:list:${tenantId}`;
  const id = c.req.param("id");
  const method = c.req.method;
  const raw2 = await c.env.SAAS_FACTORY.get(key);
  const list = raw2 ? JSON.parse(raw2) : [];
  if (method === "PATCH") {
    const body = await c.req.json();
    const idx = list.findIndex((x) => x?.id === id);
    if (idx < 0) return c.json({ ok: false, where: "STAFF_ALL_V3", error: "not_found", id, tenantId }, 404);
    const updated = { ...list[idx], ...body, id };
    list[idx] = updated;
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(list));
    return c.json({ ok: true, where: "STAFF_ALL_V3", tenantId, data: updated });
  }
  if (method === "DELETE") {
    const next = list.filter((x) => x?.id !== id);
    if (next.length === list.length) return c.json({ ok: false, where: "STAFF_ALL_V3", error: "not_found", id, tenantId }, 404);
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(next));
    return c.json({ ok: true, where: "STAFF_ALL_V3", tenantId });
  }
  return c.json({ ok: false, where: "STAFF_ALL_V3", error: "method_not_allowed", method }, 405);
});
app.get("/admin/settings", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const vTenant = await kv.get(`settings:${tenantId}`);
    const vDefault = await kv.get("settings:default");
    const tenantObj = vTenant ? JSON.parse(vTenant) : null;
    const defaultObj = vDefault ? JSON.parse(vDefault) : null;
    let merged = deepMerge(safeClone(DEFAULT_SETTINGS), defaultObj);
    merged = deepMerge(merged, tenantObj);
    return c.json({ ok: true, tenantId, data: merged });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch settings", message: String(error) }, 500);
  }
});
app.on(["PUT", "PATCH"], "/admin/menu/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const key = `admin:menu:list:${tenantId}`;
    const list = await c.env.SAAS_FACTORY.get(key, "json") ?? [];
    const idx = list.findIndex((x) => x && x.id === id);
    if (idx < 0) return c.json({ ok: false, error: "not_found" }, 404);
    const patch = await c.req.json();
    const updated = { ...list[idx], ...patch, id };
    list[idx] = updated;
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(list));
    return c.json({ ok: true, tenantId, data: updated });
  } catch (e) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.delete("/admin/menu/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const key = `admin:menu:list:${tenantId}`;
    const list = await c.env.SAAS_FACTORY.get(key, "json") ?? [];
    const next = list.filter((x) => x && x.id !== id);
    if (next.length === list.length) return c.json({ ok: false, error: "not_found" }, 404);
    await c.env.SAAS_FACTORY.put(key, JSON.stringify(next));
    return c.json({ ok: true, tenantId });
  } catch (e) {
    return c.json({ ok: false, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.put("/admin/settings", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const patch = await c.req.json().catch(() => ({}));
    const currentRaw = await kv.get(`settings:${tenantId}`);
    const current = currentRaw ? JSON.parse(currentRaw) : {};
    const next = deepMerge({ ...current || {} }, patch);
    await kv.put(`settings:${tenantId}`, JSON.stringify(next));
    return c.json({ ok: true, tenantId, data: next });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to save settings", message: String(error) }, 500);
  }
});
app.get("/admin/reservations", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const date = c.req.query("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return c.json({ ok: false, error: "bad_date", hint: "?date=YYYY-MM-DD" }, 400);
    }
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const like = `${date}T%`;
    const q = await db.prepare(`SELECT id, tenant_id, slot_start, start_at, end_at, duration_minutes,
                       customer_name, customer_phone, staff_id, note, created_at, status, meta
                FROM reservations
                WHERE tenant_id = ? AND slot_start LIKE ? AND status != 'cancelled'
                ORDER BY slot_start ASC`).bind(tenantId, like).all();
    const rows = q.results || [];
    const reservations = rows.map((r) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
      const rDate = dtMatch ? dtMatch[1] : date;
      const rTime = dtMatch ? dtMatch[2] : "";
      let meta = void 0;
      if (r.meta) {
        try {
          meta = JSON.parse(r.meta);
        } catch {
          meta = void 0;
        }
      }
      return {
        reservationId: r.id,
        date: rDate,
        time: rTime,
        name: r.customer_name ?? "",
        phone: r.customer_phone ?? void 0,
        staffId: r.staff_id ?? "any",
        note: r.note ?? void 0,
        durationMin: r.duration_minutes ?? 60,
        status: r.status ?? "active",
        createdAt: r.created_at ?? "",
        meta
      };
    });
    return c.json({ ok: true, tenantId, date, reservations });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch reservations", message: String(error) }, 500);
  }
});
app.on(["PUT", "PATCH"], "/admin/reservations/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const body = await c.req.json().catch(() => ({}));
    const sets = [];
    const vals = [];
    if ("staffId" in body) {
      sets.push("staff_id = ?");
      vals.push(body.staffId ?? null);
    }
    if ("name" in body && body.name !== void 0) {
      sets.push("customer_name = ?");
      vals.push(body.name);
    }
    if ("phone" in body) {
      sets.push("customer_phone = ?");
      vals.push(body.phone ?? null);
    }
    if ("note" in body) {
      sets.push("note = ?");
      vals.push(body.note ?? null);
    }
    if ("meta" in body) {
      const existingRow = await db.prepare("SELECT meta FROM reservations WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first().catch(() => null);
      let existingMeta = {};
      if (existingRow?.meta) {
        try {
          existingMeta = JSON.parse(existingRow.meta);
        } catch {
        }
      }
      const mergedMeta = { ...existingMeta, ...body.meta ?? {} };
      if (body.meta?.eyebrowDesign && existingMeta.eyebrowDesign) {
        mergedMeta.eyebrowDesign = { ...existingMeta.eyebrowDesign, ...body.meta.eyebrowDesign };
      }
      if (body.meta?.consentLog && existingMeta.consentLog) {
        mergedMeta.consentLog = { ...existingMeta.consentLog, ...body.meta.consentLog };
      }
      if (body.meta?.verticalData && existingMeta.verticalData) {
        mergedMeta.verticalData = { ...existingMeta.verticalData, ...body.meta.verticalData };
      }
      if (mergedMeta.eyebrowDesign?.styleType && !mergedMeta.verticalData) {
        mergedMeta.verticalData = { styleType: mergedMeta.eyebrowDesign.styleType };
      }
      sets.push("meta = ?");
      vals.push(JSON.stringify(mergedMeta));
    }
    if (sets.length === 0) return c.json({ ok: false, error: "no_fields_to_update" }, 400);
    vals.push(id, tenantId);
    await db.prepare(`UPDATE reservations SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`).bind(...vals).run();
    const row = await db.prepare("SELECT * FROM reservations WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first();
    if (!row) return c.json({ ok: false, error: "not_found" }, 404);
    const slotStr = String(row.slot_start || row.start_at || "");
    const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
    let rowMeta = void 0;
    if (row.meta) {
      try {
        rowMeta = JSON.parse(row.meta);
      } catch {
      }
    }
    return c.json({
      ok: true,
      tenantId,
      data: {
        reservationId: row.id,
        date: dtMatch ? dtMatch[1] : "",
        time: dtMatch ? dtMatch[2] : "",
        name: row.customer_name ?? "",
        phone: row.customer_phone ?? void 0,
        staffId: row.staff_id ?? "any",
        note: row.note ?? void 0,
        status: row.status ?? "active",
        createdAt: row.created_at ?? "",
        meta: rowMeta
      }
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to update reservation", message: String(error) }, 500);
  }
});
app.delete("/admin/reservations/:id", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const existing = await db.prepare("SELECT id, status FROM reservations WHERE id = ? AND tenant_id = ?").bind(id, tenantId).first();
    if (!existing) return c.json({ ok: false, error: "not_found" }, 404);
    if (existing.status === "cancelled") return c.json({ ok: false, error: "already_cancelled" }, 409);
    await db.prepare("UPDATE reservations SET status = 'cancelled' WHERE id = ? AND tenant_id = ?").bind(id, tenantId).run();
    return c.json({ ok: true, tenantId, id, status: "cancelled" });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to cancel reservation", message: String(error) }, 500);
  }
});
app.get("/admin/kpi", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const days = Math.min(Math.max(Number(c.req.query("days") || "90"), 7), 365);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
    const staffRes = await db.prepare(
      `SELECT staff_id, COUNT(*) as cnt
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'
       GROUP BY staff_id`
    ).bind(tenantId, since + "T").all();
    const staffCounts = {};
    let totalReservations = 0;
    for (const r of staffRes.results || []) {
      staffCounts[r.staff_id || "any"] = r.cnt;
      totalReservations += r.cnt;
    }
    const custRes = await db.prepare(
      `SELECT json_extract(meta, '$.customerKey') as ckey, COUNT(*) as visits
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'
         AND json_extract(meta, '$.customerKey') IS NOT NULL
       GROUP BY ckey`
    ).bind(tenantId, since + "T").all();
    const custRows = custRes.results || [];
    const totalCustomers = custRows.length;
    const repeatCustomers = custRows.filter((r) => r.visits >= 2).length;
    const repeatConversionRate = totalCustomers > 0 ? Math.round(repeatCustomers / totalCustomers * 100) : null;
    const missingRes = await db.prepare(
      `SELECT COUNT(*) as cnt FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'
         AND (meta IS NULL OR json_extract(meta, '$.customerKey') IS NULL)`
    ).bind(tenantId, since + "T").first();
    const missingCustomerKeyCount = missingRes?.cnt ?? 0;
    const intervalRes = await db.prepare(
      `SELECT json_extract(meta, '$.customerKey') as ckey,
              MIN(slot_start) as first_visit,
              MAX(slot_start) as last_visit,
              COUNT(*) as visits
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'
         AND json_extract(meta, '$.customerKey') IS NOT NULL
       GROUP BY ckey
       HAVING visits >= 2`
    ).bind(tenantId, since + "T").all();
    const intervalRows = intervalRes.results || [];
    let avgRepeatIntervalDays = null;
    if (intervalRows.length > 0) {
      let totalDays = 0;
      for (const r of intervalRows) {
        const first = new Date(r.first_visit).getTime();
        const last = new Date(r.last_visit).getTime();
        const diffDays = (last - first) / (1e3 * 60 * 60 * 24) / (r.visits - 1);
        totalDays += diffDays;
      }
      avgRepeatIntervalDays = Math.round(totalDays / intervalRows.length);
    }
    const styleRawRes = await db.prepare(
      `SELECT
         COALESCE(json_extract(meta, '$.verticalData.styleType'), json_extract(meta, '$.eyebrowDesign.styleType')) as metaStyleType,
         json_extract(meta, '$.customerKey') as ckey,
         COUNT(*) as visits
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'
         AND json_extract(meta, '$.customerKey') IS NOT NULL
       GROUP BY metaStyleType, ckey`
    ).bind(tenantId, since + "T").all();
    const styleAgg = {};
    for (const r of styleRawRes.results || []) {
      const st = r.metaStyleType || "unknown";
      if (!styleAgg[st]) styleAgg[st] = { reservationsCount: 0, customersCount: 0, repeatCustomersCount: 0 };
      styleAgg[st].reservationsCount += r.visits;
      styleAgg[st].customersCount += 1;
      if (r.visits >= 2) styleAgg[st].repeatCustomersCount += 1;
    }
    const styleBreakdown = {};
    for (const [st, agg] of Object.entries(styleAgg)) {
      styleBreakdown[st] = {
        ...agg,
        repeatConversionRate: agg.customersCount > 0 ? Math.round(agg.repeatCustomersCount / agg.customersCount * 100) : null
      };
    }
    return c.json({
      ok: true,
      tenantId,
      days,
      since,
      kpi: {
        totalReservations,
        totalCustomers,
        repeatCustomers,
        repeatConversionRate,
        avgRepeatIntervalDays,
        missingCustomerKeyCount,
        staffCounts,
        styleBreakdown
      }
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to compute KPI", message: String(error) }, 500);
  }
});
app.post("/admin/kpi/backfill-customer-key", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const days = Math.min(Math.max(Number(c.req.query("days") || "365"), 1), 730);
    const dryRun = c.req.query("dryRun") !== "0";
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
    const rows = (await db.prepare(
      `SELECT id, line_user_id, customer_phone, meta
       FROM reservations
       WHERE tenant_id = ? AND slot_start >= ?
         AND status != 'cancelled'
         AND (meta IS NULL OR json_extract(meta, '$.customerKey') IS NULL)
       LIMIT 200`
    ).bind(tenantId, since + "T").all()).results || [];
    let updatedCount = 0;
    let skippedCount = 0;
    const reasons = [];
    for (const row of rows) {
      const key = buildCustomerKey({ lineUserId: row.line_user_id, phone: row.customer_phone });
      if (!key) {
        skippedCount++;
        continue;
      }
      let existingMeta = {};
      if (row.meta) {
        try {
          existingMeta = JSON.parse(row.meta);
        } catch {
        }
      }
      const newMeta = { ...existingMeta, customerKey: key };
      if (!dryRun) {
        await db.prepare("UPDATE reservations SET meta = ? WHERE id = ?").bind(JSON.stringify(newMeta), row.id).run().catch((e) => {
          reasons.push(`id=${row.id} err=${String(e?.message ?? e)}`);
        });
      }
      updatedCount++;
    }
    return c.json({
      ok: true,
      tenantId,
      days,
      since,
      dryRun,
      scanned: rows.length,
      updatedCount,
      skippedCount,
      hasMore: rows.length === 200,
      reasons: reasons.length > 0 ? reasons : void 0
    });
  } catch (error) {
    return c.json({ ok: false, error: "Backfill failed", message: String(error) }, 500);
  }
});
app.get("/admin/onboarding-status", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const db = c.env.DB;
    const items = [];
    let storeName = "";
    let bookingUrl = "";
    let eyebrowRepeatEnabled = false;
    let eyebrowTemplateSet = false;
    if (kv) {
      try {
        const raw2 = await kv.get(`settings:${tenantId}`);
        if (raw2) {
          const s = JSON.parse(raw2);
          storeName = String(s?.storeName ?? "").trim();
          bookingUrl = String(s?.integrations?.line?.bookingUrl ?? "").trim();
          const rc = getRepeatConfig(s);
          eyebrowRepeatEnabled = rc.enabled;
          eyebrowTemplateSet = rc.template.trim().length > 0 && rc.template !== "\u524D\u56DE\u306E\u3054\u6765\u5E97\u304B\u3089\u305D\u308D\u305D\u308D{interval}\u9031\u304C\u7D4C\u3061\u307E\u3059\u3002\u7709\u6BDB\u306E\u30EA\u30BF\u30C3\u30C1\u306F\u3044\u304B\u304C\u3067\u3057\u3087\u3046\u304B\uFF1F";
        }
      } catch {
      }
    }
    if (!bookingUrl) {
      const webBase = String(c.env.WEB_BASE ?? "").trim();
      if (webBase) bookingUrl = webBase + "/booking";
    }
    items.push({ key: "storeName", label: "\u5E97\u8217\u540D\u8A2D\u5B9A", done: storeName.length > 0, action: "/admin/settings", detail: storeName || void 0 });
    items.push({ key: "bookingUrl", label: "\u4E88\u7D04URL\u8A2D\u5B9A\uFF08LINE\u9023\u643A\uFF09", done: bookingUrl.length > 0, action: "/admin/settings" });
    let menuCount = 0;
    let menuEyebrowCount = 0;
    if (kv) {
      try {
        const menuRaw = await kv.get(`admin:menu:list:${tenantId}`);
        if (menuRaw) {
          const menu = JSON.parse(menuRaw);
          const active = Array.isArray(menu) ? menu.filter((m) => m.active !== false) : [];
          menuCount = active.length;
          menuEyebrowCount = active.filter((m) => m.eyebrow?.styleType).length;
        }
      } catch {
      }
    }
    items.push({ key: "menu", label: "\u30E1\u30CB\u30E5\u30FC\u767B\u9332\uFF081\u4EF6\u4EE5\u4E0A\uFF09", done: menuCount > 0, action: "/admin/menu", detail: menuCount > 0 ? `${menuCount}\u4EF6` : void 0 });
    const eyebrowItems = eyebrowOnboardingChecks({ menuEyebrowCount, repeatEnabled: eyebrowRepeatEnabled, templateSet: eyebrowTemplateSet });
    const menuEyebrowItem = eyebrowItems.find((i) => i.key === "menuEyebrow");
    items.push(menuEyebrowItem);
    let staffCount = 0;
    if (kv) {
      try {
        const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
        if (staffRaw) {
          const staff = JSON.parse(staffRaw);
          staffCount = Array.isArray(staff) ? staff.filter((s) => s.active !== false).length : 0;
        }
      } catch {
      }
    }
    items.push({ key: "staff", label: "\u30B9\u30BF\u30C3\u30D5\u767B\u9332\uFF081\u540D\u4EE5\u4E0A\uFF09", done: staffCount > 0, action: "/admin/staff", detail: staffCount > 0 ? `${staffCount}\u540D` : void 0 });
    let hasTestReservation = false;
    if (db) {
      try {
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString();
        const row = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations WHERE tenant_id = ? AND slot_start >= ? AND status != 'cancelled'`
        ).bind(tenantId, since30).first();
        hasTestReservation = (row?.cnt ?? 0) > 0;
      } catch {
      }
    }
    items.push({ key: "testReservation", label: "\u30C6\u30B9\u30C8\u4E88\u7D04\uFF08\u76F4\u8FD130\u65E5\u306B1\u4EF6\u4EE5\u4E0A\uFF09", done: hasTestReservation, action: "/booking" });
    const repeatConfigItem = eyebrowItems.find((i) => i.key === "repeatConfig");
    items.push(repeatConfigItem);
    const completedCount = items.filter((i) => i.done).length;
    const completionRate = Math.round(completedCount / items.length * 100);
    return c.json({ ok: true, tenantId, completedCount, totalCount: items.length, completionRate, items });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to get onboarding status", message: String(error) }, 500);
  }
});
app.get("/admin/repeat-targets", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const days = Math.min(Math.max(Number(c.req.query("days") || "28"), 7), 365);
    const limit = Math.min(Math.max(Number(c.req.query("limit") || "200"), 1), 500);
    const maxPerDay = Math.min(Math.max(Number(c.req.query("maxPerDay") || "50"), 1), 500);
    const order = c.req.query("order") === "newest" ? "newest" : "oldest";
    const excludeSentWithinDays = Math.max(0, Number(c.req.query("excludeSentWithinDays") ?? "7"));
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
    let repeatTemplate = "";
    let intervalDays = 42;
    let storeName = "";
    let bookingUrl = "";
    if (kv) {
      try {
        const settingsRaw = await kv.get(`settings:${tenantId}`);
        if (settingsRaw) {
          const s = JSON.parse(settingsRaw);
          const rc = getRepeatConfig(s);
          repeatTemplate = rc.template;
          intervalDays = rc.intervalDays;
          storeName = String(s?.storeName ?? "").trim();
          bookingUrl = String(s?.integrations?.line?.bookingUrl ?? "").trim();
        }
      } catch {
      }
    }
    if (!repeatTemplate) repeatTemplate = "\u524D\u56DE\u306E\u3054\u6765\u5E97\u304B\u3089\u305D\u308D\u305D\u308D{interval}\u9031\u304C\u7D4C\u3061\u307E\u3059\u3002\u7709\u6BDB\u306E\u30EA\u30BF\u30C3\u30C1\u306F\u3044\u304B\u304C\u3067\u3057\u3087\u3046\u304B\uFF1F";
    if (!bookingUrl) {
      const webBase = String(c.env.WEB_BASE ?? c.env.ADMIN_WEB_BASE ?? "").trim();
      if (webBase) bookingUrl = webBase + "/booking";
    }
    const intervalWeeks = Math.round(intervalDays / 7);
    const staffMap = {};
    if (kv) {
      try {
        const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
        if (staffRaw) {
          const staffList = JSON.parse(staffRaw);
          for (const st of staffList) {
            if (st?.id && st?.name) staffMap[st.id] = st.name;
          }
        }
      } catch {
      }
    }
    const excludeSet = /* @__PURE__ */ new Set();
    let todaySentCount = 0;
    if (db) {
      if (excludeSentWithinDays > 0) {
        try {
          const excludeSince = new Date(Date.now() - excludeSentWithinDays * 24 * 60 * 60 * 1e3).toISOString();
          const exRows = (await db.prepare(
            `SELECT DISTINCT customer_key FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND sent_at >= ?`
          ).bind(tenantId, excludeSince).all()).results || [];
          for (const row of exRows) {
            if (row.customer_key) excludeSet.add(row.customer_key);
          }
        } catch {
        }
      }
      try {
        const todayStart = /* @__PURE__ */ new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayRow = await db.prepare(
          `SELECT COUNT(*) as cnt FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND sent_at >= ?`
        ).bind(tenantId, todayStart.toISOString()).first();
        todaySentCount = todayRow?.cnt ?? 0;
      } catch {
      }
    }
    const remainingCapacity = Math.max(0, maxPerDay - todaySentCount);
    const orderBy = order === "newest" ? "r.slot_start DESC" : "r.slot_start ASC";
    const rows = (await db.prepare(
      `SELECT
         r.id,
         json_extract(r.meta, '$.customerKey') as customerKey,
         r.line_user_id,
         r.slot_start as lastReservationAt,
         r.staff_id,
         COALESCE(json_extract(r.meta, '$.verticalData.styleType'), json_extract(r.meta, '$.eyebrowDesign.styleType')) as metaStyleType
       FROM reservations r
       INNER JOIN (
         SELECT json_extract(meta, '$.customerKey') as ck, MAX(slot_start) as maxSlot
         FROM reservations
         WHERE tenant_id = ? AND status != 'cancelled'
           AND json_extract(meta, '$.customerKey') IS NOT NULL
         GROUP BY ck
         HAVING maxSlot < ?
       ) latest ON json_extract(r.meta, '$.customerKey') = latest.ck
                AND r.slot_start = latest.maxSlot
       WHERE r.tenant_id = ? AND r.status != 'cancelled'
       ORDER BY ${orderBy}
       LIMIT ?`
    ).bind(tenantId, cutoff, tenantId, limit).all()).results || [];
    const targets = rows.map((r) => {
      let lineUserId = null;
      if (typeof r.customerKey === "string" && r.customerKey.startsWith("line:")) {
        lineUserId = r.customerKey.slice(5) || null;
      } else if (r.line_user_id) {
        lineUserId = r.line_user_id;
      }
      const styleType = r.metaStyleType || null;
      const staffName = r.staff_id && staffMap[r.staff_id] ? staffMap[r.staff_id] : "";
      const styleLabel = getStyleLabel(styleType);
      const recommendedMessage = buildRepeatMessage(repeatTemplate, {
        interval: String(intervalWeeks),
        storeName,
        style: styleLabel,
        staff: staffName,
        bookingUrl
      });
      return {
        customerKey: r.customerKey,
        lineUserId,
        lastReservationAt: r.lastReservationAt,
        lastMenuSummary: null,
        // menu_name column not in D1 schema
        staffId: r.staff_id || null,
        styleType,
        recommendedMessage
      };
    });
    const excludedCount = targets.filter((t) => excludeSet.has(t.customerKey)).length;
    const filteredTargets = targets.filter((t) => !excludeSet.has(t.customerKey));
    const cappedTargets = filteredTargets.slice(0, remainingCapacity > 0 ? remainingCapacity : filteredTargets.length);
    return c.json({
      ok: true,
      tenantId,
      days,
      cutoff,
      count: cappedTargets.length,
      targets: cappedTargets,
      // J2 meta
      todaySentCount,
      maxPerDay,
      remainingCapacity,
      excludedCount,
      order,
      excludeSentWithinDays
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to get repeat targets", message: String(error) }, 500);
  }
});
app.post("/admin/repeat-send", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    const kv = c.env.SAAS_FACTORY;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    if (!kv) return c.json({ ok: false, error: "KV_not_bound" }, 500);
    const body = await c.req.json().catch(() => null);
    if (!body || !Array.isArray(body.customerKeys)) {
      return c.json({ ok: false, error: "missing customerKeys array" }, 400);
    }
    const customerKeys = body.customerKeys.filter((k) => typeof k === "string").slice(0, 500);
    const dryRun = body.dryRun !== false;
    const customTemplate = typeof body.template === "string" ? body.template : null;
    const cooldownDays = Math.max(0, Number(body.cooldownDays ?? 7));
    let channelAccessToken = "";
    let defaultTemplate = "\u524D\u56DE\u306E\u3054\u6765\u5E97\u304B\u3089\u305D\u308D\u305D\u308D{interval}\u9031\u304C\u7D4C\u3061\u307E\u3059\u3002\u7709\u6BDB\u306E\u30EA\u30BF\u30C3\u30C1\u306F\u3044\u304B\u304C\u3067\u3057\u3087\u3046\u304B\uFF1F";
    let intervalDays = 42;
    try {
      const raw2 = await kv.get(`settings:${tenantId}`);
      if (raw2) {
        const s = JSON.parse(raw2);
        channelAccessToken = String(s?.integrations?.line?.channelAccessToken ?? "").trim();
        if (s?.eyebrow?.repeat?.template) defaultTemplate = s.eyebrow.repeat.template;
        if (s?.eyebrow?.repeat?.intervalDays) intervalDays = Number(s.eyebrow.repeat.intervalDays) || 42;
      }
    } catch {
    }
    const template = customTemplate || defaultTemplate;
    const intervalWeeks = Math.round(intervalDays / 7);
    const message = template.replace("{interval}", String(intervalWeeks));
    const lineUserMap = {};
    const nonLineKeys = [];
    for (const ck of customerKeys) {
      if (ck.startsWith("line:")) {
        const lu = ck.slice(5);
        if (lu) lineUserMap[ck] = lu;
      } else {
        nonLineKeys.push(ck);
      }
    }
    for (const ck of nonLineKeys) {
      try {
        const row = await db.prepare(
          `SELECT line_user_id FROM reservations
           WHERE tenant_id = ? AND json_extract(meta, '$.customerKey') = ? AND line_user_id IS NOT NULL
           ORDER BY slot_start DESC LIMIT 1`
        ).bind(tenantId, ck).first();
        if (row?.line_user_id) lineUserMap[ck] = row.line_user_id;
      } catch {
      }
    }
    const cooldownSet = /* @__PURE__ */ new Set();
    if (cooldownDays > 0 && !dryRun) {
      try {
        const cooldownSince = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1e3).toISOString();
        const cooldownRows = (await db.prepare(
          `SELECT DISTINCT customer_key FROM message_logs
           WHERE tenant_id = ? AND type = 'repeat' AND channel = 'line'
             AND sent_at >= ?`
        ).bind(tenantId, cooldownSince).all()).results || [];
        for (const row of cooldownRows) {
          if (row.customer_key) cooldownSet.add(row.customer_key);
        }
      } catch {
      }
    }
    let sentCount = 0;
    let skippedCount = 0;
    const samples = [];
    const errors = [];
    const skippedReasons = [];
    for (const ck of customerKeys) {
      const lineUserId = lineUserMap[ck];
      if (!lineUserId) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: "no_line_user_id" });
        continue;
      }
      if (dryRun) {
        sentCount++;
        if (samples.length < 3) samples.push({ customerKey: ck, lineUserId });
        continue;
      }
      if (cooldownSet.has(ck)) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: `cooldown_${cooldownDays}d` });
        continue;
      }
      if (!channelAccessToken) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: "no_token" });
        errors.push(`no_token:${ck}`);
        continue;
      }
      try {
        const ac = new AbortController();
        const tid = setTimeout(() => ac.abort(), 8e3);
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${channelAccessToken}` },
          body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: message }] }),
          signal: ac.signal
        });
        clearTimeout(tid);
        if (res.ok) {
          sentCount++;
          if (samples.length < 3) samples.push({ customerKey: ck, lineUserId, status: "sent" });
          try {
            const logId = `ml_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.prepare(
              `INSERT INTO message_logs (id, tenant_id, customer_key, channel, type, sent_at, payload_json)
               VALUES (?, ?, ?, 'line', 'repeat', ?, ?)`
            ).bind(logId, tenantId, ck, (/* @__PURE__ */ new Date()).toISOString(), JSON.stringify({ lineUserId, messageLen: message.length })).run();
          } catch {
          }
        } else {
          const errText = await res.text().catch(() => "");
          skippedCount++;
          skippedReasons.push({ customerKey: ck, reason: `send_failed_${res.status}` });
          errors.push(`send_failed:${ck}:${res.status}:${errText.slice(0, 100)}`);
        }
      } catch (e) {
        skippedCount++;
        skippedReasons.push({ customerKey: ck, reason: "send_error" });
        errors.push(`send_error:${ck}:${String(e?.message ?? e)}`);
      }
    }
    return c.json({
      ok: true,
      tenantId,
      dryRun,
      cooldownDays: dryRun ? void 0 : cooldownDays,
      message: dryRun ? message : void 0,
      sentCount,
      skippedCount,
      total: customerKeys.length,
      samples: samples.length > 0 ? samples : void 0,
      skippedReasons: skippedReasons.length > 0 ? skippedReasons : void 0,
      errors: errors.length > 0 ? errors : void 0
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to send repeat messages", message: String(error) }, 500);
  }
});
app.get("/admin/repeat-metrics", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
    const days = Math.min(Math.max(Number(c.req.query("days") || "90"), 7), 365);
    const windowDays = Math.min(Math.max(Number(c.req.query("windowDays") || "14"), 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString();
    let sentCount = 0;
    let uniqueCustomersSent = 0;
    try {
      const sentRow = await db.prepare(
        `SELECT COUNT(*) as sentCount, COUNT(DISTINCT customer_key) as uniqueCustomersSent
         FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND channel = 'line' AND sent_at >= ?`
      ).bind(tenantId, since).first();
      sentCount = sentRow?.sentCount ?? 0;
      uniqueCustomersSent = sentRow?.uniqueCustomersSent ?? 0;
    } catch {
    }
    let sentCustomers = [];
    try {
      sentCustomers = (await db.prepare(
        `SELECT customer_key, MIN(sent_at) as first_sent_at
         FROM message_logs WHERE tenant_id = ? AND type = 'repeat' AND channel = 'line' AND sent_at >= ?
         GROUP BY customer_key`
      ).bind(tenantId, since).all()).results || [];
    } catch {
    }
    let convertedCustomers = 0;
    let reservationsAfterSend = 0;
    for (const sc of sentCustomers) {
      try {
        const windowEnd = new Date(new Date(sc.first_sent_at).getTime() + windowDays * 24 * 60 * 60 * 1e3).toISOString();
        const row = await db.prepare(
          `SELECT COUNT(*) as cnt FROM reservations
           WHERE tenant_id = ? AND json_extract(meta, '$.customerKey') = ?
             AND slot_start >= ? AND slot_start <= ? AND status != 'cancelled'`
        ).bind(tenantId, sc.customer_key, sc.first_sent_at, windowEnd).first();
        if ((row?.cnt ?? 0) > 0) {
          convertedCustomers++;
          reservationsAfterSend += row.cnt;
        }
      } catch {
      }
    }
    const conversionAfterSendRate = uniqueCustomersSent > 0 ? Math.round(convertedCustomers / uniqueCustomersSent * 100) : null;
    return c.json({
      ok: true,
      tenantId,
      days,
      windowDays,
      since,
      metrics: { sentCount, uniqueCustomersSent, reservationsAfterSend, convertedCustomers, conversionAfterSendRate }
    });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to get repeat metrics", message: String(error) }, 500);
  }
});
app.get("/admin/availability", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const date = c.req.query("date") || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const kv = c.env.SAAS_FACTORY;
    const staffRaw = await kv.get(`admin:staff:list:${tenantId}`);
    const staffList = staffRaw ? JSON.parse(staffRaw) : [];
    const result = {};
    for (const staff of staffList) {
      const key = `availability:${tenantId}:${staff.id}:${date}`;
      const raw2 = await kv.get(key);
      result[staff.id] = raw2 ? JSON.parse(raw2) : {};
    }
    return c.json({ ok: true, tenantId, date, staff: result });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to fetch availability", message: String(error) }, 500);
  }
});
app.put("/admin/availability", async (c) => {
  try {
    const tenantId = getTenantId(c);
    const kv = c.env.SAAS_FACTORY;
    const body = await c.req.json();
    if (!body.staffId || !body.date || !body.time || !body.status) {
      return c.json({ ok: false, error: "missing_fields", need: ["staffId", "date", "time", "status"] }, 400);
    }
    const validStatuses = ["open", "half", "closed"];
    if (!validStatuses.includes(body.status)) {
      return c.json({ ok: false, error: "invalid_status", valid: validStatuses }, 400);
    }
    const key = `availability:${tenantId}:${body.staffId}:${body.date}`;
    const raw2 = await kv.get(key);
    const current = raw2 ? JSON.parse(raw2) : {};
    current[body.time] = body.status;
    await kv.put(key, JSON.stringify(current));
    return c.json({ ok: true, tenantId, staffId: body.staffId, date: body.date, time: body.time, status: body.status });
  } catch (error) {
    return c.json({ ok: false, error: "Failed to save availability", message: String(error) }, 500);
  }
});
app.get("/admin/staff/:id/shift", async (c) => {
  const tenantId = getTenantId(c, null);
  const staffId = c.req.param("id");
  const kv = c.env.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_binding_missing" }, 500);
  try {
    const raw2 = await kv.get(`admin:staff:shift:${tenantId}:${staffId}`);
    const data = raw2 ? JSON.parse(raw2) : { staffId, weekly: [], exceptions: [] };
    return c.json({ ok: true, tenantId, data });
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
app.put("/admin/staff/:id/shift", async (c) => {
  const tenantId = getTenantId(c, null);
  const staffId = c.req.param("id");
  const kv = c.env.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "kv_binding_missing" }, 500);
  try {
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, error: "bad_json" }, 400);
    await kv.put(`admin:staff:shift:${tenantId}:${staffId}`, JSON.stringify(body));
    return c.json({ ok: true, tenantId, data: body });
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/customers", async (c) => {
  const STAMP = "ADMIN_CUSTOMERS_V1";
  const tenantId = getTenantId(c, null);
  const db = c.env.DB;
  if (!db) return c.json({ ok: false, stamp: STAMP, error: "DB_not_bound" }, 500);
  try {
    const result = await db.prepare(
      `SELECT id, name, phone, visit_count, last_visit_at, created_at
         FROM customers
         WHERE tenant_id = ?
         ORDER BY updated_at DESC
         LIMIT 200`
    ).bind(tenantId).all();
    const customers = (result.results || []).map((r) => ({
      id: r.id,
      name: r.name ?? "",
      phone: r.phone ?? null,
      visitCount: r.visit_count ?? 0,
      lastVisitAt: r.last_visit_at ?? null
    }));
    return c.json({ ok: true, stamp: STAMP, tenantId, customers });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, error: "Failed to fetch customers", message: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/dashboard", async (c) => {
  const STAMP = "ADMIN_DASHBOARD_V1";
  const tenantId = getTenantId(c, null);
  const db = c.env.DB;
  if (!db) return c.json({ ok: false, stamp: STAMP, error: "DB_not_bound" }, 500);
  let date = (c.req.query("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const jst = new Date(Date.now() + 9 * 60 * 60 * 1e3);
    date = jst.toISOString().slice(0, 10);
  }
  const like = `${date}T%`;
  try {
    const [resResult, cusResult] = await Promise.all([
      db.prepare(
        `SELECT id, slot_start, start_at, customer_name, customer_phone, staff_id, duration_minutes
           FROM reservations
           WHERE tenant_id = ? AND slot_start LIKE ? AND status != 'cancelled'
           ORDER BY slot_start ASC`
      ).bind(tenantId, like).all(),
      db.prepare(
        `SELECT id, name, phone, visit_count, last_visit_at
           FROM customers
           WHERE tenant_id = ?
           ORDER BY updated_at DESC
           LIMIT 50`
      ).bind(tenantId).all()
    ]);
    const rows = resResult.results || [];
    const reservationsToday = rows.length;
    const schedule = rows.map((r) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const timeMatch = /T(\d{2}:\d{2})/.exec(slotStr);
      return {
        time: timeMatch ? timeMatch[1] : "",
        reservationId: r.id,
        customerName: r.customer_name ?? "",
        customerPhone: r.customer_phone ?? null,
        staffId: r.staff_id ?? "",
        durationMin: r.duration_minutes ?? 60
      };
    });
    const customers = (cusResult.results || []).map((r) => ({
      id: r.id,
      name: r.name ?? "",
      phone: r.phone ?? null,
      visitCount: r.visit_count ?? 0,
      lastVisitAt: r.last_visit_at ?? null
    }));
    return c.json({
      ok: true,
      stamp: STAMP,
      tenantId,
      date,
      kpis: {
        reservationsToday,
        revenueExpectedToday: 0
        // Phase 1: no price in reservations table
      },
      schedule,
      customers
    });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, error: "dashboard_error", message: String(e?.message ?? e) }, 500);
  }
});
app.get("/__debug/routes", (c) => {
  const routes = app.routes ?? [];
  return c.json({ ok: true, count: routes.length, routes });
});
app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));
app.onError((err, c) => {
  console.error(err);
  try {
    const u = new URL(c.req.url);
    if (u.searchParams.get("debug") === "1") {
      const msg = String(err?.message ?? err);
      const stack = String(err?.stack ?? "");
      return c.json({ ok: false, error: "internal_error", message: msg, stack }, 500);
    }
  } catch {
  }
  return c.json({ ok: false, error: "internal_error" }, 500);
});
async function notifyLineReservation(opts) {
  const STAMP = "LINE_RESERVE_NOTIFY_V1_20260225";
  if (opts.flag !== "1") {
    console.log(`[${STAMP}] notify.skipped.flagOff tenantId=${opts.tenantId} flag=${opts.flag}`);
    return;
  }
  if (!opts.lineUserId) {
    console.log(`[${STAMP}] notify.skipped.noUserId tenantId=${opts.tenantId}`);
    return;
  }
  if (!opts.kv) {
    console.log(`[${STAMP}] notify.skipped.noKV tenantId=${opts.tenantId}`);
    return;
  }
  try {
    let accessToken = "";
    let storeAddress = "";
    try {
      const raw2 = await opts.kv.get(`settings:${opts.tenantId}`);
      const s = raw2 ? JSON.parse(raw2) : {};
      accessToken = String(s?.integrations?.line?.channelAccessToken ?? "").trim();
      storeAddress = String(s?.storeAddress ?? "").trim();
    } catch {
    }
    if (!accessToken) {
      console.log(`[${STAMP}] skip: no channelAccessToken tenantId=${opts.tenantId}`);
      return;
    }
    const jst = /* @__PURE__ */ __name((iso) => {
      try {
        return new Date(iso).toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
      } catch {
        return iso;
      }
    }, "jst");
    const nameStr = opts.customerName ? `
\u304A\u540D\u524D: ${opts.customerName}` : "";
    const addressStr = storeAddress ? `
\u{1F4CD}\u5E97\u8217\u4F4F\u6240
${storeAddress}` : "";
    const text = `\u4E88\u7D04\u304C\u78BA\u5B9A\u3057\u307E\u3057\u305F\u2705
\u65E5\u6642: ${jst(opts.startAt)}${nameStr}${addressStr}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 5e3);
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken
      },
      body: JSON.stringify({ to: opts.lineUserId, messages: [{ type: "text", text }] }),
      signal: ac.signal
    });
    clearTimeout(tid);
    const bodyText = await res.text().catch(() => "");
    console.log(`[${STAMP}] notify.sent tenantId=${opts.tenantId} userId=${opts.lineUserId} status=${res.status} ok=${res.ok} body=${bodyText.slice(0, 200)}`);
  } catch (e) {
    console.log(`[${STAMP}] notify.error tenantId=${opts.tenantId} userId=${opts.lineUserId} err=${String(e?.message ?? e)}`);
  }
}
__name(notifyLineReservation, "notifyLineReservation");
function normalizePhone(phone) {
  return phone.replace(/\D/g, "");
}
__name(normalizePhone, "normalizePhone");
function buildCustomerKey(opts) {
  if (opts.lineUserId && opts.lineUserId.trim()) return `line:${opts.lineUserId.trim()}`;
  if (opts.phone && opts.phone.trim()) {
    const digits = normalizePhone(opts.phone.trim());
    if (digits.length >= 7) return `phone:${digits}`;
  }
  if (opts.email && opts.email.trim()) {
    const e = opts.email.trim().toLowerCase();
    if (e.includes("@")) return `email:${e}`;
  }
  return null;
}
__name(buildCustomerKey, "buildCustomerKey");
async function upsertCustomer(db, opts) {
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const visitDate = opts.visitAt.slice(0, 10);
    if (opts.phone) {
      const existing = await db.prepare("SELECT id, visit_count FROM customers WHERE tenant_id = ? AND phone = ? LIMIT 1").bind(opts.tenantId, opts.phone).first();
      if (existing) {
        const newCount = (existing.visit_count || 0) + 1;
        await db.prepare(
          "UPDATE customers SET name = COALESCE(?, name), visit_count = ?, last_visit_at = ?, updated_at = ? WHERE id = ?"
        ).bind(opts.name, newCount, visitDate, now, existing.id).run();
        return existing.id;
      }
    }
    const cid = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO customers (id, tenant_id, name, phone, created_at, updated_at, last_visit_at, visit_count) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
    ).bind(cid, opts.tenantId, opts.name, opts.phone, now, now, visitDate).run();
    return cid;
  } catch (e) {
    console.error("[CUSTOMER_UPSERT] error:", String(e?.message ?? e));
    return null;
  }
}
__name(upsertCustomer, "upsertCustomer");
app.post("/reserve", async (c) => {
  const url = new URL(c.req.url);
  const debug = url.searchParams.get("debug") === "1";
  const lockTestMs = Math.max(0, Math.min(1e4, Number(url.searchParams.get("lockTestMs") ?? "0") || 0));
  const body = await c.req.json().catch(() => null);
  const tenantId = getTenantId(c, body);
  if (!body) {
    return c.json({ ok: false, error: "bad_json" }, 400);
  }
  const staffId = String(body.staffId ?? "");
  const startAt = String(body.startAt ?? "");
  const endAt = String(body.endAt ?? "");
  const customerName = body.customerName ? String(body.customerName) : null;
  const lineUserId = body.lineUserId ? String(body.lineUserId).trim() : "";
  if (!staffId || !startAt || !endAt) {
    return c.json({ ok: false, error: "missing_fields", need: ["staffId", "startAt", "endAt"] }, 400);
  }
  const env2 = c.env;
  if (!env2.DB) return c.json({ ok: false, error: "DB_not_bound" }, 500);
  if (!env2.SLOT_LOCK) return c.json({ ok: false, error: "SLOT_LOCK_not_bound" }, 500);
  const date = new Date(startAt).toISOString().slice(0, 10);
  const id = env2.SLOT_LOCK.idFromName(tenantId + ":" + staffId + ":" + date);
  const stub = env2.SLOT_LOCK.get(id);
  const lockRes = await stub.fetch("https://slotlock/lock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // AUTO-INSERT: ensure (startAt + "|" + endAt) exists before first use
    body: JSON.stringify({ key: startAt + "|" + endAt, ttlSeconds: 30 })
  });
  if (lockRes.status === 409) {
    const j = await lockRes.json().catch(() => ({}));
    return c.json({ ok: false, error: "slot_locked", ...j }, 409);
  }
  if (!lockRes.ok) {
    const t = await lockRes.text().catch(() => "");
    return c.json({ ok: false, error: "lock_failed", status: lockRes.status, detail: t }, 500);
  }
  try {
    const startMs = Date.parse(startAt);
    const endMs = Date.parse(endAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      return c.json({ ok: false, error: "bad_time_range", startAt, endAt }, 400);
    }
    const durationMin = Math.round((endMs - startMs) / 6e4);
    const rid = crypto.randomUUID();
    let followupAt = null;
    try {
      const kv = env2.SAAS_FACTORY;
      if (kv) {
        const ret = await aiGetJson(kv, `ai:retention:${tenantId}`);
        if (ret?.enabled) {
          const delayMin = Number(ret?.followupDelayMin ?? AI_DEFAULT_RETENTION.followupDelayMin) || AI_DEFAULT_RETENTION.followupDelayMin;
          followupAt = new Date(Date.now() + delayMin * 60 * 1e3).toISOString();
        }
      }
    } catch {
    }
    try {
      await env2.DB.prepare(`INSERT INTO reservations (id, tenant_id, slot_start, duration_minutes, customer_name, customer_phone, staff_id, start_at, end_at, line_user_id, followup_at, followup_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        rid,
        tenantId,
        startAt,
        // slot_start
        durationMin,
        // duration_minutes
        customerName,
        body.phone ? String(body.phone) : null,
        // customer_phone (optional)
        staffId,
        startAt,
        endAt,
        lineUserId || null,
        // line_user_id
        followupAt,
        // followup_at (null if retention disabled)
        followupAt ? "pending" : null
        // followup_status
      ).run();
    } catch (e) {
      const msg = String(e?.message ?? e ?? "");
      if (msg.includes("UNIQUE constraint failed")) {
        return c.json({ ok: false, error: "duplicate_slot", tenantId, staffId, startAt }, 409);
      }
      throw e;
    }
    await notifyLineReservation({
      kv: env2.SAAS_FACTORY,
      tenantId,
      lineUserId,
      customerName,
      startAt,
      staffId,
      flag: String(env2.LINE_NOTIFY_ON_RESERVE ?? "0").trim()
    }).catch(() => null);
    const phone = body.phone ? String(body.phone) : null;
    const customerId = await upsertCustomer(env2.DB, { tenantId, name: customerName, phone, visitAt: startAt });
    if (customerId) {
      await env2.DB.prepare("UPDATE reservations SET customer_id = ? WHERE id = ?").bind(customerId, rid).run().catch((e) => console.error("[RESERVE_CUSTOMER_LINK] error:", String(e?.message ?? e)));
    }
    const email = body.email ? String(body.email).trim().toLowerCase() : null;
    const customerKey = buildCustomerKey({ lineUserId, phone, email });
    const bodyMeta = body.meta && typeof body.meta === "object" && !Array.isArray(body.meta) ? body.meta : {};
    if (bodyMeta.eyebrowDesign?.styleType && !bodyMeta.verticalData) {
      bodyMeta.verticalData = { styleType: bodyMeta.eyebrowDesign.styleType };
    }
    const finalMeta = { ...bodyMeta, ...customerKey ? { customerKey } : {} };
    if (Object.keys(finalMeta).length > 0) {
      await env2.DB.prepare("UPDATE reservations SET meta = ? WHERE id = ?").bind(JSON.stringify(finalMeta), rid).run().catch((e) => console.error("[RESERVE_META] error:", String(e?.message ?? e)));
    }
    return c.json({ ok: true, id: rid, tenantId, staffId, startAt, endAt, ...customerKey ? { customerKey } : {} });
  } finally {
    await stub.fetch("https://slotlock/unlock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: startAt + "|" + endAt })
    }).catch(() => null);
    if (lockTestMs > 0) {
      await sleep(lockTestMs);
    }
  }
});
app.get("/__debug/reserve-keys", async (c) => {
  const url = new URL(c.req.url);
  const tenantId = url.searchParams.get("tenantId") ?? c.req.header("x-tenant-id") ?? "default";
  const staffId = url.searchParams.get("staffId") ?? "";
  const startAt = url.searchParams.get("startAt") ?? "";
  const endAt = url.searchParams.get("endAt") ?? "";
  if (!staffId || !startAt || !endAt) {
    return c.json({ ok: false, error: "missing", need: ["staffId", "startAt", "endAt"] }, 400);
  }
  const date = new Date(startAt).toISOString().slice(0, 10);
  const doName = `${tenantId}:${staffId}:${date}`;
  const lockKey = `${startAt}|${endAt}`;
  const id = env.SLOT_LOCK.idFromName(doName);
  const stub = env.SLOT_LOCK.get(id);
  return c.json({ ok: true, tenantId, staffId, startAt, endAt, date, doName, lockKey });
});
async function queue(batch) {
  for (const msg of batch.messages) {
    msg.ack();
  }
}
__name(queue, "queue");
app.get("/my/reservations", async (c) => {
  const tenantId = getTenantId(c);
  const customerKey = c.req.query("customerKey");
  if (!customerKey || customerKey.trim().length < 4) {
    return c.json({ ok: false, error: "missing_customerKey" }, 400);
  }
  const db = c.env.DB;
  if (!db) return c.json({ ok: false, error: "DB_not_bound" }, 500);
  try {
    const q = await db.prepare(
      `SELECT id, slot_start, start_at, end_at, duration_minutes, customer_name, staff_id, status, meta
       FROM reservations
       WHERE tenant_id = ?
         AND json_extract(meta, '$.customerKey') = ?
         AND status != 'cancelled'
       ORDER BY start_at DESC
       LIMIT 20`
    ).bind(tenantId, customerKey.trim()).all();
    const rows = q.results || [];
    const reservations = rows.map((r) => {
      const slotStr = String(r.slot_start || r.start_at || "");
      const dtMatch = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(slotStr);
      let meta = void 0;
      if (r.meta) {
        try {
          meta = JSON.parse(r.meta);
        } catch {
        }
      }
      return {
        reservationId: r.id,
        date: dtMatch ? dtMatch[1] : "",
        time: dtMatch ? dtMatch[2] : "",
        name: r.customer_name ?? "",
        staffId: r.staff_id ?? "any",
        durationMin: r.duration_minutes ?? 60,
        status: r.status ?? "active",
        menuName: meta?.menuName ?? void 0,
        surveyAnswers: meta?.surveyAnswers ?? void 0
      };
    });
    return c.json({ ok: true, tenantId, reservations });
  } catch (e) {
    console.error("[MY_RESERVATIONS]", String(e?.message ?? e));
    return c.json({ ok: false, error: "db_error" }, 500);
  }
});
var index_default = { fetch: app.fetch, queue, scheduled };
app.get("/auth/line/start", async (c) => {
  const tenantId = c.req.query("tenantId") || "default";
  const returnTo = c.req.query("returnTo") || "https://saas-factory-web-v2.pages.dev/admin/settings";
  const env2 = c.env;
  const clientId = env2.LINE_CHANNEL_ID ?? env2.LINE_LOGIN_CHANNEL_ID ?? env2.LINE_CLIENT_ID ?? "";
  const redirectUri = env2.LINE_REDIRECT_URI ?? env2.LINE_LOGIN_REDIRECT_URI ?? env2.LINE_CALLBACK_URL ?? "";
  if (!clientId || !redirectUri) {
    return c.json(
      { ok: false, error: "missing line env", need: ["LINE_CHANNEL_ID", "LINE_REDIRECT_URI"] },
      500
    );
  }
  const stateObj = { tenantId, returnTo, ts: Date.now() };
  const state = btoa(JSON.stringify(stateObj));
  const scope = "profile%20openid";
  const authUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&scope=${scope}`;
  return c.redirect(authUrl, 302);
});
app.get("/auth/line/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state") || "";
  if (!code) return c.json({ ok: false, error: "missing_code" }, 400);
  let returnTo = "https://saas-factory-web-v2.pages.dev/admin/settings";
  try {
    const s = JSON.parse(atob(state));
    if (s?.returnTo) returnTo = s.returnTo;
  } catch {
  }
  const session = crypto.randomUUID();
  c.header(
    "Set-Cookie",
    `line_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
  );
  return c.redirect(returnTo, 302);
});
app.post("/auth/line/exchange", async (c) => {
  const env2 = c.env;
  let body = {};
  try {
    body = await c.req.json();
  } catch {
  }
  const { code, tenantId = "default", redirectUri } = body;
  if (!code || !redirectUri) {
    return c.json({ ok: false, error: "missing_params" }, 400);
  }
  const clientId = env2.LINE_CHANNEL_ID ?? env2.LINE_LOGIN_CHANNEL_ID ?? env2.LINE_CLIENT_ID ?? "";
  const clientSecret = env2.LINE_LOGIN_CHANNEL_SECRET ?? "";
  if (!clientId || !clientSecret) {
    return c.json({ ok: false, error: "missing_line_login_config" }, 500);
  }
  const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    })
  });
  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => "");
    return c.json({ ok: false, error: "token_exchange_failed", detail: errText }, 400);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token ?? "";
  if (!accessToken) {
    return c.json({ ok: false, error: "no_access_token" }, 400);
  }
  const profileRes = await fetch("https://api.line.me/v2/profile", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!profileRes.ok) {
    return c.json({ ok: false, error: "profile_fetch_failed" }, 400);
  }
  const profile = await profileRes.json();
  const userId = profile.userId ?? "";
  const displayName = profile.displayName ?? "";
  if (!userId) {
    return c.json({ ok: false, error: "no_user_id" }, 400);
  }
  const kv = env2.SAAS_FACTORY;
  const settingsRaw = await kv.get(`settings:${tenantId}`, "json") ?? {};
  const allowedList = Array.isArray(settingsRaw.allowedAdminLineUserIds) ? settingsRaw.allowedAdminLineUserIds : [];
  if (allowedList.length === 0) {
    await kv.put(`settings:${tenantId}`, JSON.stringify({
      ...settingsRaw,
      allowedAdminLineUserIds: [userId]
    }));
    return c.json({ ok: true, userId, displayName, allowed: true, seeded: true });
  }
  const allowed = allowedList.includes(userId);
  return c.json({ ok: true, userId, displayName, allowed });
});
app.get("/admin/integrations/line/status", async (c) => {
  const tenantId = c.req.query("tenantId") || "default";
  const env2 = c.env;
  const channelId = env2.LINE_CHANNEL_ID ?? env2.LINE_LOGIN_CHANNEL_ID ?? env2.LINE_CLIENT_ID ?? "";
  const redirectUri = env2.LINE_REDIRECT_URI ?? env2.LINE_LOGIN_REDIRECT_URI ?? env2.LINE_CALLBACK_URL ?? "";
  const loginReady = !!(channelId && redirectUri);
  const need = [];
  if (!channelId) need.push("LINE_CHANNEL_ID");
  if (!redirectUri) need.push("LINE_REDIRECT_URI");
  return c.json({
    ok: true,
    tenantId,
    connected: loginReady,
    loginReady,
    need,
    line_session_present: false,
    stamp: "LINE_STATUS_v1",
    debug: false
  });
});
async function readLineKv(kv, tenantId) {
  try {
    const raw2 = await kv.get(`settings:${tenantId}`);
    const s = raw2 ? JSON.parse(raw2) : {};
    return s?.integrations?.line ?? {};
  } catch {
    return {};
  }
}
__name(readLineKv, "readLineKv");
async function verifyLineToken(token) {
  try {
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), 4e3);
    const r = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: "Bearer " + token },
      signal: ac.signal
    });
    clearTimeout(tid);
    return r.ok ? "ok" : "ng";
  } catch {
    return "ng";
  }
}
__name(verifyLineToken, "verifyLineToken");
app.get("/admin/integrations/line/messaging/status", async (c) => {
  const STAMP = "LINE_MSG_STATUS_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const line = await readLineKv(kv, tenantId);
    const accessToken = String(line?.channelAccessToken ?? "").trim();
    const secret = String(line?.channelSecret ?? "").trim();
    if (!accessToken && !secret) {
      return c.json({
        ok: true,
        tenantId,
        stamp: STAMP,
        kind: "unconfigured",
        checks: { token: "ng", webhook: "ng" }
      });
    }
    const tokenCheck = accessToken ? await verifyLineToken(accessToken) : "ng";
    const kind = accessToken && secret ? tokenCheck === "ok" ? "linked" : "partial" : "partial";
    return c.json({
      ok: true,
      tenantId,
      stamp: STAMP,
      kind,
      checks: { token: tokenCheck, webhook: "ng" }
    });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "status_error", detail: String(e?.message ?? e) }, 500);
  }
});
app.post("/admin/integrations/line/messaging/save", async (c) => {
  const STAMP = "LINE_MSG_SAVE_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => ({}));
    const channelAccessToken = String(body?.channelAccessToken ?? "").trim();
    const channelSecret = String(body?.channelSecret ?? "").trim();
    const bookingUrl = String(body?.webhookUrl ?? body?.bookingUrl ?? "").trim() || void 0;
    if (!channelAccessToken) return c.json({ ok: false, stamp: STAMP, error: "missing_channelAccessToken" }, 400);
    if (!channelSecret) return c.json({ ok: false, stamp: STAMP, error: "missing_channelSecret" }, 400);
    const key = `settings:${tenantId}`;
    let existing = {};
    try {
      const r = await kv.get(key);
      if (r) existing = JSON.parse(r);
    } catch {
    }
    const existingLine = existing?.integrations?.line ?? {};
    const updatedLine = {
      ...existingLine,
      connected: true,
      channelAccessToken,
      channelSecret,
      ...bookingUrl ? { bookingUrl } : {}
    };
    const next = {
      ...existing,
      integrations: { ...existing.integrations ?? {}, line: updatedLine }
    };
    await kv.put(key, JSON.stringify(next));
    const tokenCheck = await verifyLineToken(channelAccessToken);
    const kind = tokenCheck === "ok" ? "linked" : "partial";
    return c.json({
      ok: true,
      tenantId,
      stamp: STAMP,
      kind,
      checks: { token: tokenCheck, webhook: "ng" }
    });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "save_error", detail: String(e?.message ?? e) }, 500);
  }
});
app.delete("/admin/integrations/line/messaging", async (c) => {
  const STAMP = "LINE_MSG_DELETE_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const key = `settings:${tenantId}`;
    let existing = {};
    try {
      const r = await kv.get(key);
      if (r) existing = JSON.parse(r);
    } catch {
    }
    const { channelSecret: _s, channelAccessToken: _t, bookingUrl: _b, connected: _c, channelId: _id, ...restLine } = existing?.integrations?.line ?? {};
    const next = {
      ...existing,
      integrations: {
        ...existing.integrations ?? {},
        line: { ...restLine, connected: false }
      }
    };
    await kv.put(key, JSON.stringify(next));
    return c.json({
      ok: true,
      tenantId,
      stamp: STAMP,
      kind: "unconfigured",
      checks: { token: "ng", webhook: "ng" }
    });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "delete_error", detail: String(e?.message ?? e) }, 500);
  }
});
app.post("/admin/integrations/line/last-user", async (c) => {
  const STAMP = "LINE_LAST_USER_POST_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    if (!userId || !userId.startsWith("U")) {
      return c.json({ ok: false, stamp: STAMP, error: "invalid_userId" }, 400);
    }
    await kv.put(`line:lastUser:${tenantId}`, userId, { expirationTtl: 86400 });
    return c.json({ ok: true, tenantId, stamp: STAMP, userId });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "save_error", detail: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/integrations/line/last-user", async (c) => {
  const STAMP = "LINE_LAST_USER_GET_V1_20260225";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const userId = await kv.get(`line:lastUser:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, userId: userId ?? null });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "get_error", detail: String(e?.message ?? e) }, 500);
  }
});
var AI_DEFAULT_SETTINGS = {
  enabled: false,
  voice: "friendly",
  answerLength: "normal",
  character: ""
};
var AI_DEFAULT_POLICY = {
  prohibitedTopics: [],
  hardRules: [
    "Do not confirm prices or availability without checking official info.",
    "Do not provide medical/illegal advice.",
    "Never claim actions were taken (booking created) \u2014 booking is form-only."
  ]
};
var AI_DEFAULT_RETENTION = {
  enabled: false,
  templates: [],
  followupDelayMin: 43200,
  // 30 days in minutes
  followupTemplate: "{{customerName}}\u69D8\u3001\u5148\u65E5\u306F\u3054\u6765\u5E97\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3057\u305F\uFF01\u307E\u305F\u306E\u3054\u6765\u5E97\u3092\u304A\u5F85\u3061\u3057\u3066\u304A\u308A\u307E\u3059\u3002",
  nextRecommendationDaysByMenu: {}
};
var AI_DEFAULT_UPSELL = {
  enabled: false,
  items: []
};
async function aiGetJson(kv, key) {
  try {
    const v = await kv.get(key, "json");
    return v || null;
  } catch {
    try {
      const v2 = await kv.get(key);
      return v2 ? JSON.parse(v2) : null;
    } catch {
      return null;
    }
  }
}
__name(aiGetJson, "aiGetJson");
function extractResponseText(resp) {
  if (!resp || typeof resp !== "object") return "";
  if (typeof resp.output_text === "string" && resp.output_text.trim()) {
    return resp.output_text.trim();
  }
  if (Array.isArray(resp.output)) {
    const parts = [];
    for (const item of resp.output) {
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (typeof part?.text === "string" && part.text.trim()) {
            parts.push(part.text.trim());
          }
        }
      } else if (typeof item?.content === "string" && item.content.trim()) {
        parts.push(item.content.trim());
      } else if (typeof item?.text === "string" && item.text.trim()) {
        parts.push(item.text.trim());
      }
    }
    if (parts.length > 0) return parts.join("\n");
  }
  const choiceContent = resp?.choices?.[0]?.message?.content;
  if (typeof choiceContent === "string" && choiceContent.trim()) {
    return choiceContent.trim();
  }
  if (resp.response && typeof resp.response === "object" && resp.response !== resp) {
    const nested = extractResponseText(resp.response);
    if (nested) return nested;
  }
  return "";
}
__name(extractResponseText, "extractResponseText");
app.get("/admin/ai", async (c) => {
  const STAMP = "AI_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const [s, p, r] = await Promise.all([
      aiGetJson(kv, `ai:settings:${tenantId}`),
      aiGetJson(kv, `ai:policy:${tenantId}`),
      aiGetJson(kv, `ai:retention:${tenantId}`)
    ]);
    return c.json({
      ok: true,
      tenantId,
      stamp: STAMP,
      settings: { ...AI_DEFAULT_SETTINGS, ...s || {} },
      policy: { ...AI_DEFAULT_POLICY, ...p || {} },
      retention: { ...AI_DEFAULT_RETENTION, ...r || {} }
    });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.put("/admin/ai", async (c) => {
  const STAMP = "AI_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const saved = [];
    if (body.settings != null && typeof body.settings === "object") {
      const key = `ai:settings:${tenantId}`;
      const ex = await aiGetJson(kv, key) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_SETTINGS, ...ex, ...body.settings }));
      saved.push("settings");
    }
    if (body.policy != null && typeof body.policy === "object") {
      const key = `ai:policy:${tenantId}`;
      const ex = await aiGetJson(kv, key) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_POLICY, ...ex, ...body.policy }));
      saved.push("policy");
    }
    if (body.retention != null && typeof body.retention === "object") {
      const key = `ai:retention:${tenantId}`;
      const ex = await aiGetJson(kv, key) || {};
      await kv.put(key, JSON.stringify({ ...AI_DEFAULT_RETENTION, ...ex, ...body.retention }));
      saved.push("retention");
    }
    return c.json({ ok: true, tenantId, stamp: STAMP, saved });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/ai/faq", async (c) => {
  const STAMP = "AI_FAQ_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const faqRaw = await aiGetJson(kv, `ai:faq:${tenantId}`);
    const faq = Array.isArray(faqRaw) ? faqRaw : [];
    return c.json({ ok: true, tenantId, stamp: STAMP, faq });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.post("/admin/ai/faq", async (c) => {
  const STAMP = "AI_FAQ_POST_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => null);
    if (!body?.question || !body?.answer) {
      return c.json({ ok: false, stamp: STAMP, error: "missing_fields", hint: "question and answer required" }, 400);
    }
    const key = `ai:faq:${tenantId}`;
    const faqRaw = await aiGetJson(kv, key);
    const faq = Array.isArray(faqRaw) ? faqRaw : [];
    const item = {
      id: crypto.randomUUID(),
      question: String(body.question).trim(),
      answer: String(body.answer).trim(),
      tags: Array.isArray(body.tags) ? body.tags : [],
      enabled: body.enabled !== false,
      updatedAt: Date.now()
    };
    faq.push(item);
    await kv.put(key, JSON.stringify(faq));
    return c.json({ ok: true, tenantId, stamp: STAMP, item });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.delete("/admin/ai/faq/:id", async (c) => {
  const STAMP = "AI_FAQ_DELETE_V1";
  const tenantId = getTenantId(c, null);
  const id = c.req.param("id");
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const key = `ai:faq:${tenantId}`;
    const faqRaw = await aiGetJson(kv, key);
    const faq = Array.isArray(faqRaw) ? faqRaw : [];
    const before = faq.length;
    const next = faq.filter((f) => f.id !== id);
    await kv.put(key, JSON.stringify(next));
    return c.json({ ok: true, tenantId, stamp: STAMP, id, deleted: before - next.length });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/ai/policy", async (c) => {
  const STAMP = "AI_POLICY_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const p = await aiGetJson(kv, `ai:policy:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, policy: { ...AI_DEFAULT_POLICY, ...p || {} } });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.put("/admin/ai/policy", async (c) => {
  const STAMP = "AI_POLICY_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:policy:${tenantId}`;
    const ex = await aiGetJson(kv, key) || {};
    const merged = {
      ...AI_DEFAULT_POLICY,
      ...ex,
      ...body.prohibitedTopics != null ? { prohibitedTopics: Array.isArray(body.prohibitedTopics) ? body.prohibitedTopics : [] } : {},
      ...body.hardRules != null ? { hardRules: Array.isArray(body.hardRules) ? body.hardRules : [] } : {}
    };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, policy: merged });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/ai/retention", async (c) => {
  const STAMP = "AI_RETENTION_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const r = await aiGetJson(kv, `ai:retention:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, retention: { ...AI_DEFAULT_RETENTION, ...r || {} } });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.put("/admin/ai/retention", async (c) => {
  const STAMP = "AI_RETENTION_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:retention:${tenantId}`;
    const ex = await aiGetJson(kv, key) || {};
    const merged = { ...AI_DEFAULT_RETENTION, ...ex, ...body };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, retention: merged });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.post("/ai/chat", async (c) => {
  const STAMP = "AI_CHAT_V3";
  const env2 = c.env;
  let tenantId = "default";
  const isDebug = c.req.query("debug") === "1";
  const sleep2 = /* @__PURE__ */ __name((ms) => new Promise((resolve) => setTimeout(resolve, ms)), "sleep");
  try {
    const body = await c.req.json().catch(() => ({}));
    tenantId = getTenantId(c, body);
    const apiKey = env2?.OPENAI_API_KEY;
    if (!apiKey) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "not_configured", detail: "OPENAI_API_KEY missing" });
    }
    const message = String(body?.message ?? "").trim();
    if (!message) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "missing_message", detail: "message is required" });
    }
    const model = String(env2?.OPENAI_MODEL || "gpt-4o").trim() || "gpt-4o";
    const kv = env2?.SAAS_FACTORY;
    let aiSettings = { voice: "friendly", character: "", answerLength: "normal" };
    let aiPolicy = { prohibitedTopics: [], hardRules: [] };
    let aiFaq = [];
    let aiUpsell = { ...AI_DEFAULT_UPSELL };
    if (kv) {
      const [s, p, f, u] = await Promise.all([
        aiGetJson(kv, `ai:settings:${tenantId}`),
        aiGetJson(kv, `ai:policy:${tenantId}`),
        aiGetJson(kv, `ai:faq:${tenantId}`),
        aiGetJson(kv, `ai:upsell:${tenantId}`)
      ]);
      if (s && typeof s === "object") aiSettings = { ...aiSettings, ...s };
      if (p && typeof p === "object") aiPolicy = { ...aiPolicy, ...p };
      if (Array.isArray(f)) aiFaq = f.filter((x) => x.enabled !== false);
      if (u && typeof u === "object") aiUpsell = { ...AI_DEFAULT_UPSELL, ...u };
    }
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
    const rlKey = `ai:rl:${tenantId}:${ip}`;
    if (kv) {
      try {
        const rlRaw = await kv.get(rlKey);
        const rl = rlRaw ? JSON.parse(rlRaw) : { count: 0, windowStart: Date.now() };
        const now = Date.now();
        if (now - rl.windowStart > 6e5) {
          rl.count = 1;
          rl.windowStart = now;
        } else {
          rl.count++;
        }
        if (rl.count > 60) {
          return c.json({ ok: false, stamp: STAMP, tenantId, error: "rate_limited" }, 429);
        }
        await kv.put(rlKey, JSON.stringify(rl), { expirationTtl: 700 });
      } catch {
      }
    }
    const faqMatch = aiFaq.find((fItem) => {
      const q = String(fItem.question ?? "").toLowerCase().trim();
      const m = message.toLowerCase();
      return q && (m === q || m.includes(q) || q.includes(m));
    });
    if (faqMatch) {
      const faqAnswer = String(faqMatch.answer ?? "").trim();
      if (faqAnswer) {
        const bkw = ["\u4E88\u7D04", "\u3054\u4E88\u7D04", "booking", "reserve", "\u30D5\u30A9\u30FC\u30E0", "\u4E88\u7D04\u30D5\u30A9\u30FC\u30E0"];
        const needsBooking2 = bkw.some((k) => faqAnswer.includes(k) || message.includes(k));
        const suggestedActions2 = needsBooking2 ? [{ type: "open_booking_form", url: "/booking" }] : [];
        return c.json({ ok: true, stamp: STAMP, tenantId, answer: faqAnswer, suggestedActions: suggestedActions2, source: "faq" });
      }
    }
    const faqBlock = aiFaq.length > 0 ? "\n\n## FAQ\uFF08\u3088\u304F\u3042\u308B\u8CEA\u554F\u3068\u56DE\u7B54\uFF09\n" + aiFaq.slice(0, 20).map((f) => `Q: ${f.question}
A: ${f.answer}`).join("\n\n") : "";
    const hardRulesBlock = aiPolicy.hardRules.length > 0 ? "\n\n## \u7981\u6B62\u30EB\u30FC\u30EB\n" + aiPolicy.hardRules.map((r) => `- ${r}`).join("\n") : "";
    const prohibitedBlock = aiPolicy.prohibitedTopics.length > 0 ? "\n\n## \u7981\u6B62\u30C8\u30D4\u30C3\u30AF: " + aiPolicy.prohibitedTopics.join(", ") : "";
    const systemContent = [
      "\u3042\u306A\u305F\u306F\u304A\u5E97\u306EAI\u30A2\u30B7\u30B9\u30BF\u30F3\u30C8\u3067\u3059\u3002",
      aiSettings.character ? `\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC\u8A2D\u5B9A: ${aiSettings.character}` : "",
      `\u53E3\u8ABF: ${aiSettings.voice}`,
      `\u56DE\u7B54\u306E\u9577\u3055: ${aiSettings.answerLength}`,
      "",
      "## \u7D76\u5BFE\u306B\u5B88\u308B\u30EB\u30FC\u30EB",
      "- \u4E88\u7D04\u306F\u30D5\u30A9\u30FC\u30E0\u3067\u306E\u307F\u78BA\u5B9A\u3057\u307E\u3059\u3002\u3042\u306A\u305F\u306F\u4E88\u7D04\u3092\u4F5C\u3063\u305F\u308A\u78BA\u7D04\u3057\u305F\u308A\u3057\u307E\u305B\u3093\u3002",
      "- \u6599\u91D1\u30FB\u7A7A\u304D\u67A0\u30FB\u898F\u7D04\u306A\u3069\u4E0D\u78BA\u5B9F\u306A\u60C5\u5831\u306F\u65AD\u5B9A\u3057\u307E\u305B\u3093\u3002",
      "- \u4E88\u7D04\u306B\u95A2\u3059\u308B\u8CEA\u554F\u306B\u306F\u300C\u4E88\u7D04\u30D5\u30A9\u30FC\u30E0\u304B\u3089\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u300D\u3068\u6848\u5185\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "- \u533B\u7642\u30FB\u6CD5\u5F8B\u30FB\u653F\u6CBB\u30FB\u5B97\u6559\u306A\u3069\u306E\u30A2\u30C9\u30D0\u30A4\u30B9\u306F\u3057\u307E\u305B\u3093\u3002",
      "- booking created \u3084 reservation confirmed \u306A\u3069\u306E\u884C\u52D5\u3092\u8D77\u3053\u3057\u305F\u3068\u306F\u7D76\u5BFE\u306B\u8A00\u3044\u307E\u305B\u3093\u3002",
      faqBlock,
      hardRulesBlock,
      prohibitedBlock
    ].filter(Boolean).join("\n");
    const openaiPayload = {
      model,
      store: false,
      max_output_tokens: 1600,
      input: [
        { role: "system", content: systemContent },
        { role: "user", content: message }
      ]
    };
    let openaiRes = null;
    let openaiStatus = 0;
    try {
      const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(openaiPayload)
      });
      openaiStatus = r.status;
      openaiRes = await r.json().catch(() => null);
    } catch (fetchErr) {
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "upstream_error", detail: String(fetchErr?.message ?? fetchErr) });
    }
    if (!openaiRes || openaiStatus !== 200) {
      const detail = openaiRes?.error?.message ?? openaiRes?.error ?? `HTTP ${openaiStatus}`;
      return c.json({ ok: false, stamp: STAMP, tenantId, error: "upstream_error", detail: String(detail) });
    }
    const statusHistory = [String(openaiRes?.status ?? "unknown")];
    const RETRY_DELAYS_MS = [250, 400, 650];
    const responseId = openaiRes?.id;
    const needsPoll = /* @__PURE__ */ __name((s) => s === "incomplete" || s === "in_progress" || s === "queued", "needsPoll");
    if (responseId && needsPoll(openaiRes?.status)) {
      for (let i = 0; i < RETRY_DELAYS_MS.length; i++) {
        await sleep2(RETRY_DELAYS_MS[i]);
        try {
          const rr = await fetch(`https://api.openai.com/v1/responses/${responseId}`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${apiKey}` }
          });
          if (rr.ok) {
            const retrieved = await rr.json().catch(() => null);
            if (retrieved && typeof retrieved === "object") {
              openaiRes = retrieved;
              statusHistory.push(String(retrieved?.status ?? "unknown"));
            }
          }
        } catch {
        }
        if (!needsPoll(openaiRes?.status)) break;
      }
    }
    if (openaiRes?.status === "incomplete") {
      const rawHint = isDebug ? {
        statusHistory,
        outputTypes: Array.isArray(openaiRes?.output) ? openaiRes.output.map((x) => x?.type ?? null) : null,
        incompleteDetails: openaiRes?.incomplete_details ?? null
      } : void 0;
      return c.json({
        ok: false,
        stamp: STAMP,
        tenantId,
        error: "incomplete",
        detail: "OpenAI response did not complete (token limit exceeded)",
        ...rawHint !== void 0 ? { rawHint } : {}
      });
    }
    let answer = extractResponseText(openaiRes);
    if (!answer) {
      const rawHint = isDebug ? {
        statusHistory,
        keys: Object.keys(openaiRes),
        responseStatus: openaiRes?.status,
        outputLength: Array.isArray(openaiRes?.output) ? openaiRes.output.length : null,
        outputTypes: Array.isArray(openaiRes?.output) ? openaiRes.output.map((x) => x?.type ?? null) : null,
        hasOutputText: typeof openaiRes?.output_text === "string",
        outputTextLen: typeof openaiRes?.output_text === "string" ? openaiRes.output_text.length : 0,
        firstContentInfo: Array.isArray(openaiRes?.output) && openaiRes.output.length > 0 && Array.isArray(openaiRes.output[0]?.content) ? openaiRes.output[0].content.map((x) => ({
          type: x?.type ?? null,
          hasText: typeof x?.text === "string",
          textLen: typeof x?.text === "string" ? x.text.length : 0
        })) : null
      } : void 0;
      return c.json({
        ok: false,
        stamp: STAMP,
        tenantId,
        error: "empty_response",
        detail: isDebug ? "No text extracted (debug)" : "No text extracted",
        ...rawHint !== void 0 ? { rawHint } : {}
      });
    }
    const bookingKw = ["\u4E88\u7D04", "\u3054\u4E88\u7D04", "booking", "reserve", "\u30D5\u30A9\u30FC\u30E0", "\u4E88\u7D04\u30D5\u30A9\u30FC\u30E0"];
    const needsBooking = bookingKw.some((k) => answer.includes(k) || message.includes(k));
    const suggestedActions = needsBooking ? [{ type: "open_booking_form", url: "/booking" }] : [];
    if (aiUpsell.enabled && Array.isArray(aiUpsell.items) && aiUpsell.items.length > 0) {
      const matchedUpsells = aiUpsell.items.filter((item) => {
        if (item.enabled === false) return false;
        const kw = String(item.keyword ?? "").toLowerCase().trim();
        return kw && (message.toLowerCase().includes(kw) || answer.toLowerCase().includes(kw));
      });
      if (matchedUpsells.length > 0) {
        const upsellText = matchedUpsells.map((u) => String(u.message ?? "")).filter(Boolean).join("\n");
        if (upsellText) answer = answer + "\n\n" + upsellText;
      }
    }
    return c.json({ ok: true, stamp: STAMP, tenantId, answer, suggestedActions });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) });
  }
});
app.get("/admin/ai/upsell", async (c) => {
  const STAMP = "AI_UPSELL_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const u = await aiGetJson(kv, `ai:upsell:${tenantId}`);
    return c.json({ ok: true, tenantId, stamp: STAMP, upsell: { ...AI_DEFAULT_UPSELL, ...u || {} } });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.put("/admin/ai/upsell", async (c) => {
  const STAMP = "AI_UPSELL_PUT_V1";
  const tenantId = getTenantId(c, null);
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, stamp: STAMP, error: "kv_missing" }, 500);
    const body = await c.req.json().catch(() => null);
    if (!body) return c.json({ ok: false, stamp: STAMP, error: "bad_json" }, 400);
    const key = `ai:upsell:${tenantId}`;
    const ex = await aiGetJson(kv, key) || {};
    const merged = { ...AI_DEFAULT_UPSELL, ...ex, ...body };
    await kv.put(key, JSON.stringify(merged));
    return c.json({ ok: true, tenantId, stamp: STAMP, upsell: merged });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.get("/admin/ai/followups", async (c) => {
  const STAMP = "AI_FOLLOWUPS_GET_V1";
  const tenantId = getTenantId(c, null);
  try {
    const db = c.env.DB;
    if (!db) return c.json({ ok: false, stamp: STAMP, error: "db_missing" }, 500);
    const { results } = await db.prepare(
      `SELECT id, line_user_id, customer_name, slot_start, followup_at, followup_status, followup_sent_at, followup_error
       FROM reservations
       WHERE tenant_id = ? AND followup_status IS NOT NULL
       ORDER BY followup_at DESC
       LIMIT 50`
    ).bind(tenantId).all();
    return c.json({ ok: true, tenantId, stamp: STAMP, followups: results ?? [] });
  } catch (e) {
    return c.json({ ok: false, stamp: STAMP, tenantId, error: "exception", detail: String(e?.message ?? e) }, 500);
  }
});
app.post("/ai/dedup", async (c) => {
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ isNew: true });
    const body = await c.req.json().catch(() => null);
    const key = body?.key ? String(body.key) : "";
    if (!key || !key.startsWith("ai:evt:")) return c.json({ isNew: true });
    const ttl = Math.min(300, Math.max(30, Number(body.ttlSeconds ?? 120)));
    const existing = await kv.get(key);
    if (existing !== null) return c.json({ isNew: false });
    await kv.put(key, "1", { expirationTtl: ttl });
    return c.json({ isNew: true });
  } catch {
    return c.json({ isNew: true });
  }
});
app.post("/ai/pushq", async (c) => {
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "no_kv" });
    const body = await c.req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    const userId = String(body?.userId ?? "").trim();
    if (!tenantId || !userId) return c.json({ ok: false, error: "missing_fields" });
    const ttl = Math.min(600, Math.max(60, Number(body.ttlSeconds ?? 600)));
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const key = `ai:pushq:${tenantId}:${id}`;
    await kv.put(key, JSON.stringify({
      tenantId,
      userId,
      messages: Array.isArray(body.messages) ? body.messages : [],
      enqueuedAt: (/* @__PURE__ */ new Date()).toISOString()
    }), { expirationTtl: ttl });
    return c.json({ ok: true, key });
  } catch {
    return c.json({ ok: false, error: "internal" });
  }
});
app.post("/ai/linelog", async (c) => {
  try {
    const kv = c.env.SAAS_FACTORY;
    if (!kv) return c.json({ ok: false, error: "no_kv" });
    const body = await c.req.json().catch(() => null);
    const tenantId = String(body?.tenantId ?? "").trim();
    if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" });
    const entry = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      type: String(body?.type ?? "unknown").slice(0, 32),
      uid: String(body?.uid ?? "").slice(0, 12),
      pushStatus: Number(body?.pushStatus ?? 0),
      pushBodySnippet: String(body?.pushBodySnippet ?? "").slice(0, 200),
      aiMs: Number(body?.aiMs ?? 0)
    };
    const kvKey = `ai:linelog:${tenantId}`;
    let logs = [];
    try {
      const raw2 = await kv.get(kvKey);
      if (raw2) logs = JSON.parse(raw2);
    } catch {
    }
    logs.unshift(entry);
    if (logs.length > 50) logs = logs.slice(0, 50);
    await kv.put(kvKey, JSON.stringify(logs), { expirationTtl: 86400 * 7 });
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false, error: "internal" });
  }
});
app.get("/ai/linelog", async (c) => {
  const env2 = c.env;
  const kv = env2.SAAS_FACTORY;
  if (!kv) return c.json({ ok: false, error: "no_kv" }, 500);
  const adminToken = String(env2.ADMIN_TOKEN ?? "").trim();
  if (adminToken) {
    const provided = c.req.header("X-Admin-Token") ?? c.req.query("token") ?? "";
    if (provided !== adminToken) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
  }
  const tenantId = c.req.query("tenantId") ?? "";
  if (!tenantId) return c.json({ ok: false, error: "missing_tenantId" }, 400);
  let logs = [];
  try {
    const raw2 = await kv.get(`ai:linelog:${tenantId}`);
    if (raw2) logs = JSON.parse(raw2);
  } catch {
  }
  return c.json({ ok: true, tenantId, count: logs.length, logs });
});
async function scheduled(_event, env2, _ctx) {
  const kv = env2.SAAS_FACTORY;
  if (!kv) return;
  const db = env2.DB;
  if (db) {
    const STAMP = "AI_FOLLOWUP_CRON_V1";
    try {
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const { results } = await db.prepare(
        `SELECT id, tenant_id, line_user_id, customer_name, slot_start
         FROM reservations
         WHERE followup_status = 'pending'
           AND followup_at IS NOT NULL
           AND followup_at <= ?
         LIMIT 50`
      ).bind(now).all();
      if (results && results.length > 0) {
        for (const row of results) {
          const { id, tenant_id: tId, line_user_id: lineUserId, customer_name: custName, slot_start: slotStart } = row;
          if (!lineUserId) {
            await db.prepare(`UPDATE reservations SET followup_status = 'skipped', followup_sent_at = ? WHERE id = ?`).bind(now, id).run().catch(() => null);
            continue;
          }
          let channelAccessToken = null;
          try {
            const settingsRaw = await kv.get(`settings:${tId}`);
            if (settingsRaw) {
              const s = JSON.parse(settingsRaw);
              channelAccessToken = s?.integrations?.line?.channelAccessToken ?? null;
            }
          } catch {
          }
          if (!channelAccessToken) {
            await db.prepare(`UPDATE reservations SET followup_status = 'skipped', followup_sent_at = ?, followup_error = ? WHERE id = ?`).bind(now, "no_channel_token", id).run().catch(() => null);
            continue;
          }
          let template = "{{customerName}}\u69D8\u3001\u5148\u65E5\u306F\u3054\u6765\u5E97\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3057\u305F\uFF01\u307E\u305F\u306E\u3054\u6765\u5E97\u3092\u304A\u5F85\u3061\u3057\u3066\u304A\u308A\u307E\u3059\u3002";
          try {
            const ret = await aiGetJson(kv, `ai:retention:${tId}`);
            if (ret?.enabled && ret?.followupTemplate) template = String(ret.followupTemplate);
          } catch {
          }
          const visitDate = slotStart ? new Date(slotStart).toLocaleDateString("ja-JP") : "";
          const msg = template.replace("{{customerName}}", custName || "\u304A\u5BA2\u69D8").replace("{{visitDate}}", visitDate);
          try {
            const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${channelAccessToken}`
              },
              body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: msg }] })
            });
            if (lineRes.ok) {
              await db.prepare(`UPDATE reservations SET followup_status = 'sent', followup_sent_at = ? WHERE id = ?`).bind(now, id).run().catch(() => null);
            } else {
              const errText = await lineRes.text().catch(() => `HTTP ${lineRes.status}`);
              await db.prepare(`UPDATE reservations SET followup_status = 'failed', followup_sent_at = ?, followup_error = ? WHERE id = ?`).bind(now, errText.slice(0, 200), id).run().catch(() => null);
            }
          } catch (sendErr) {
            await db.prepare(`UPDATE reservations SET followup_status = 'failed', followup_sent_at = ?, followup_error = ? WHERE id = ?`).bind(now, String(sendErr?.message ?? sendErr).slice(0, 200), id).run().catch(() => null);
          }
        }
      }
    } catch (e) {
      console.error(`[${STAMP}] error:`, String(e?.message ?? e));
    }
  }
  const PUSHQ_STAMP = "PUSHQ_CONSUMER_V1";
  try {
    const { keys } = await kv.list({ prefix: "ai:pushq:", limit: 50 });
    if (keys && keys.length > 0) {
      console.log(`[${PUSHQ_STAMP}] processing ${keys.length} items`);
      for (const { name: qKey } of keys) {
        try {
          const raw2 = await kv.get(qKey);
          if (!raw2) continue;
          const item = JSON.parse(raw2);
          const { tenantId: tId, userId, messages } = item;
          if (!tId || !userId || !Array.isArray(messages)) {
            await kv.delete(qKey);
            continue;
          }
          let channelAccessToken = null;
          try {
            const settingsRaw = await kv.get(`settings:${tId}`);
            if (settingsRaw) {
              const s = JSON.parse(settingsRaw);
              channelAccessToken = s?.integrations?.line?.channelAccessToken ?? null;
            }
          } catch {
          }
          if (!channelAccessToken) {
            console.log(`[${PUSHQ_STAMP}] discard key=...${qKey.slice(-12)} reason=no_token`);
            await kv.delete(qKey);
            continue;
          }
          const pushRes = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${channelAccessToken}`
            },
            body: JSON.stringify({ to: userId, messages })
          });
          const pushBody = await pushRes.text().catch(() => "");
          console.log(
            `[${PUSHQ_STAMP}] tenant=${tId} uid=${userId.slice(0, 6)}*** st=${pushRes.status} ok=${pushRes.ok} body=${pushBody.slice(0, 80)}`
          );
          if (pushRes.ok) {
            await kv.delete(qKey);
          }
        } catch (itemErr) {
          console.error(`[${PUSHQ_STAMP}] item error:`, String(itemErr?.message ?? itemErr));
        }
      }
    }
  } catch (pushqErr) {
    console.error(`[${PUSHQ_STAMP}] list error:`, String(pushqErr?.message ?? pushqErr));
  }
}
__name(scheduled, "scheduled");
export {
  SlotLock,
  index_default as default
};
//# sourceMappingURL=index.js.map
