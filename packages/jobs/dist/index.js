var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/schedule.ts
import { Client } from "@upstash/qstash";
var FIRE_URL = "https://chanlytics-messaging.vercel.app/api/jobs/fire";
async function scheduleJob(db, p) {
  const { data: job, error } = await db.from("jobs").insert({
    tenant_id: p.tenantId,
    kind: p.kind,
    due_at: p.dueAt.toISOString(),
    payload: p.payload
  }).select("id, cancel_token").single();
  if (error || !job) throw new Error(`schedule_job: ${error?.message}`);
  const qstash = new Client({ token: p.qstashToken });
  let res;
  try {
    res = await qstash.publishJSON({
      url: FIRE_URL,
      body: { job_id: job.id },
      notBefore: Math.ceil(p.dueAt.getTime() / 1e3),
      deduplicationId: job.id
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("jobs").update({ state: "failed", last_error: `publish: ${msg}` }).eq("id", job.id);
    throw new Error(`schedule_job publish: ${msg}`);
  }
  const { error: linkErr } = await db.from("jobs").update({ qstash_id: res.messageId }).eq("id", job.id);
  if (linkErr) console.error("schedule_job_link_failed", job.id, linkErr.message);
  return { jobId: job.id, cancelToken: job.cancel_token };
}
async function cancelJob(db, jobId, qstashToken) {
  const { data, error } = await db.from("jobs").update({ state: "canceled" }).eq("id", jobId).eq("state", "scheduled").select("qstash_id").maybeSingle();
  if (error || !data) return false;
  if (qstashToken && data.qstash_id) {
    try {
      await new Client({ token: qstashToken }).messages.delete(data.qstash_id);
    } catch {
    }
  }
  return true;
}
async function cancelJobsFor(db, tenantId, kind, payloadKey, payloadValue, qstashToken) {
  const { data } = await db.from("jobs").select("id").eq("tenant_id", tenantId).eq("kind", kind).eq("state", "scheduled").eq(`payload->>${payloadKey}`, payloadValue);
  let n = 0;
  for (const j of data ?? []) {
    if (await cancelJob(db, j.id, qstashToken)) n++;
  }
  return n;
}

// ../channels/dist/index.js
var __defProp2 = Object.defineProperty;
var __export2 = (target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
};
var external_exports = {};
__export2(external_exports, {
  BRAND: () => BRAND,
  DIRTY: () => DIRTY,
  EMPTY_PATH: () => EMPTY_PATH,
  INVALID: () => INVALID,
  NEVER: () => NEVER,
  OK: () => OK,
  ParseStatus: () => ParseStatus,
  Schema: () => ZodType,
  ZodAny: () => ZodAny,
  ZodArray: () => ZodArray,
  ZodBigInt: () => ZodBigInt,
  ZodBoolean: () => ZodBoolean,
  ZodBranded: () => ZodBranded,
  ZodCatch: () => ZodCatch,
  ZodDate: () => ZodDate,
  ZodDefault: () => ZodDefault,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
  ZodEffects: () => ZodEffects,
  ZodEnum: () => ZodEnum,
  ZodError: () => ZodError,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
  ZodFunction: () => ZodFunction,
  ZodIntersection: () => ZodIntersection,
  ZodIssueCode: () => ZodIssueCode,
  ZodLazy: () => ZodLazy,
  ZodLiteral: () => ZodLiteral,
  ZodMap: () => ZodMap,
  ZodNaN: () => ZodNaN,
  ZodNativeEnum: () => ZodNativeEnum,
  ZodNever: () => ZodNever,
  ZodNull: () => ZodNull,
  ZodNullable: () => ZodNullable,
  ZodNumber: () => ZodNumber,
  ZodObject: () => ZodObject,
  ZodOptional: () => ZodOptional,
  ZodParsedType: () => ZodParsedType,
  ZodPipeline: () => ZodPipeline,
  ZodPromise: () => ZodPromise,
  ZodReadonly: () => ZodReadonly,
  ZodRecord: () => ZodRecord,
  ZodSchema: () => ZodType,
  ZodSet: () => ZodSet,
  ZodString: () => ZodString,
  ZodSymbol: () => ZodSymbol,
  ZodTransformer: () => ZodEffects,
  ZodTuple: () => ZodTuple,
  ZodType: () => ZodType,
  ZodUndefined: () => ZodUndefined,
  ZodUnion: () => ZodUnion,
  ZodUnknown: () => ZodUnknown,
  ZodVoid: () => ZodVoid,
  addIssueToContext: () => addIssueToContext,
  any: () => anyType,
  array: () => arrayType,
  bigint: () => bigIntType,
  boolean: () => booleanType,
  coerce: () => coerce,
  custom: () => custom,
  date: () => dateType,
  datetimeRegex: () => datetimeRegex,
  defaultErrorMap: () => en_default,
  discriminatedUnion: () => discriminatedUnionType,
  effect: () => effectsType,
  enum: () => enumType,
  function: () => functionType,
  getErrorMap: () => getErrorMap,
  getParsedType: () => getParsedType,
  instanceof: () => instanceOfType,
  intersection: () => intersectionType,
  isAborted: () => isAborted,
  isAsync: () => isAsync,
  isDirty: () => isDirty,
  isValid: () => isValid,
  late: () => late,
  lazy: () => lazyType,
  literal: () => literalType,
  makeIssue: () => makeIssue,
  map: () => mapType,
  nan: () => nanType,
  nativeEnum: () => nativeEnumType,
  never: () => neverType,
  null: () => nullType,
  nullable: () => nullableType,
  number: () => numberType,
  object: () => objectType,
  objectUtil: () => objectUtil,
  oboolean: () => oboolean,
  onumber: () => onumber,
  optional: () => optionalType,
  ostring: () => ostring,
  pipeline: () => pipelineType,
  preprocess: () => preprocessType,
  promise: () => promiseType,
  quotelessJson: () => quotelessJson,
  record: () => recordType,
  set: () => setType,
  setErrorMap: () => setErrorMap,
  strictObject: () => strictObjectType,
  string: () => stringType,
  symbol: () => symbolType,
  transformer: () => effectsType,
  tuple: () => tupleType,
  undefined: () => undefinedType,
  union: () => unionType,
  unknown: () => unknownType,
  util: () => util,
  void: () => voidType
});
var util;
(function(util22) {
  util22.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util22.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util22.assertNever = assertNever;
  util22.arrayToEnum = (items) => {
    const obj3 = {};
    for (const item of items) {
      obj3[item] = item;
    }
    return obj3;
  };
  util22.getValidEnumValues = (obj3) => {
    const validKeys = util22.objectKeys(obj3).filter((k) => typeof obj3[obj3[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj3[k];
    }
    return util22.objectValues(filtered);
  };
  util22.objectValues = (obj3) => {
    return util22.objectKeys(obj3).map(function(e) {
      return obj3[e];
    });
  };
  util22.objectKeys = typeof Object.keys === "function" ? (obj3) => Object.keys(obj3) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util22.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util22.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util22.joinValues = joinValues;
  util22.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util || (util = {}));
var objectUtil;
(function(objectUtil22) {
  objectUtil22.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType.undefined;
    case "string":
      return ZodParsedType.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
    case "boolean":
      return ZodParsedType.boolean;
    case "function":
      return ZodParsedType.function;
    case "bigint":
      return ZodParsedType.bigint;
    case "symbol":
      return ZodParsedType.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType.array;
      }
      if (data === null) {
        return ZodParsedType.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType.date;
      }
      return ZodParsedType.object;
    default:
      return ZodParsedType.unknown;
  }
};
var ZodIssueCode = util.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson = (obj3) => {
  const json = JSON.stringify(obj3, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError = class _ZodError extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError.create = (issues) => {
  const error = new ZodError(issues);
  return error;
};
var errorMap = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === ZodParsedType.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
      break;
    case ZodIssueCode.invalid_enum_value:
      message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util.assertNever(issue);
  }
  return { message };
};
var en_default = errorMap;
var overrideErrorMap = en_default;
function setErrorMap(map) {
  overrideErrorMap = map;
}
function getErrorMap() {
  return overrideErrorMap;
}
var makeIssue = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH = [];
function addIssueToContext(ctx, issueData) {
  const overrideMap = getErrorMap();
  const issue = makeIssue({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default ? void 0 : en_default
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus = class _ParseStatus {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID;
      if (value.status === "aborted")
        return INVALID;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID = Object.freeze({
  status: "aborted"
});
var DIRTY = (value) => ({ status: "dirty", value });
var OK = (value) => ({ status: "valid", value });
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
var errorUtil;
(function(errorUtil22) {
  errorUtil22.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil22.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));
var ParseInputLazyPath = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult = (ctx, result) => {
  if (isValid(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams(params) {
  if (!params)
    return {};
  const { errorMap: errorMap22, invalid_type_error, required_error, description } = params;
  if (errorMap22 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap22)
    return { errorMap: errorMap22, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects({
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional.create(this, this._def);
  }
  nullable() {
    return ZodNullable.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray.create(this);
  }
  promise() {
    return ZodPromise.create(this, this._def);
  }
  or(option) {
    return ZodUnion.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects({
      ...processCreateParams(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault({
      ...processCreateParams(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodDefault
    });
  }
  brand() {
    return new ZodBranded({
      typeName: ZodFirstPartyTypeKind.ZodBranded,
      type: this,
      ...processCreateParams(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch({
      ...processCreateParams(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline.create(this, target);
  }
  readonly() {
    return ZodReadonly.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
  return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
  let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT(jwt, alg) {
  if (!jwtRegex.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
    return true;
  }
  return false;
}
var ZodString = class _ZodString extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.string,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "email",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex) {
          emojiRegex = new RegExp(_emojiRegex, "u");
        }
        if (!emojiRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "emoji",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "uuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "nanoid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cuid2",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ulid",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "regex",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "duration",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "ip",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "jwt",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "cidr",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            validation: "base64url",
            code: ZodIssueCode.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode.invalid_string,
      ...errorUtil.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil.errToObj(message));
  }
  trim() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString.create = (params) => {
  return new ZodString({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
function floatSafeRemainder(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber = class _ZodNumber extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.number,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber.create = (params) => {
  return new ZodNumber({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodBigInt = class _ZodBigInt extends ZodType {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.bigint,
      received: ctx.parsedType
    });
    return INVALID;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt.create = (params) => {
  return new ZodBigInt({
    checks: [],
    typeName: ZodFirstPartyTypeKind.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams(params)
  });
};
var ZodBoolean = class extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.boolean,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodBoolean.create = (params) => {
  return new ZodBoolean({
    typeName: ZodFirstPartyTypeKind.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams(params)
  });
};
var ZodDate = class _ZodDate extends ZodType {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.date,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_date
      });
      return INVALID;
    }
    const status = new ParseStatus();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate.create = (params) => {
  return new ZodDate({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind.ZodDate,
    ...processCreateParams(params)
  });
};
var ZodSymbol = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.symbol,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodSymbol.create = (params) => {
  return new ZodSymbol({
    typeName: ZodFirstPartyTypeKind.ZodSymbol,
    ...processCreateParams(params)
  });
};
var ZodUndefined = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.undefined,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodUndefined.create = (params) => {
  return new ZodUndefined({
    typeName: ZodFirstPartyTypeKind.ZodUndefined,
    ...processCreateParams(params)
  });
};
var ZodNull = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.null,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodNull.create = (params) => {
  return new ZodNull({
    typeName: ZodFirstPartyTypeKind.ZodNull,
    ...processCreateParams(params)
  });
};
var ZodAny = class extends ZodType {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodAny.create = (params) => {
  return new ZodAny({
    typeName: ZodFirstPartyTypeKind.ZodAny,
    ...processCreateParams(params)
  });
};
var ZodUnknown = class extends ZodType {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK(input.data);
  }
};
ZodUnknown.create = (params) => {
  return new ZodUnknown({
    typeName: ZodFirstPartyTypeKind.ZodUnknown,
    ...processCreateParams(params)
  });
};
var ZodNever = class extends ZodType {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext(ctx, {
      code: ZodIssueCode.invalid_type,
      expected: ZodParsedType.never,
      received: ctx.parsedType
    });
    return INVALID;
  }
};
ZodNever.create = (params) => {
  return new ZodNever({
    typeName: ZodFirstPartyTypeKind.ZodNever,
    ...processCreateParams(params)
  });
};
var ZodVoid = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.void,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return OK(input.data);
  }
};
ZodVoid.create = (params) => {
  return new ZodVoid({
    typeName: ZodFirstPartyTypeKind.ZodVoid,
    ...processCreateParams(params)
  });
};
var ZodArray = class _ZodArray extends ZodType {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext(ctx, {
          code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
    });
    return ParseStatus.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray({
      ...this._def,
      minLength: { value: minLength, message: errorUtil.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray({
      ...this._def,
      exactLength: { value: len, message: errorUtil.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray.create = (schema, params) => {
  return new ZodArray({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind.ZodArray,
    ...processCreateParams(params)
  });
};
function deepPartialify(schema) {
  if (schema instanceof ZodObject) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
    }
    return new ZodObject({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray) {
    return new ZodArray({
      ...schema._def,
      type: deepPartialify(schema.element)
    });
  } else if (schema instanceof ZodOptional) {
    return ZodOptional.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodNullable) {
    return ZodNullable.create(deepPartialify(schema.unwrap()));
  } else if (schema instanceof ZodTuple) {
    return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
  } else {
    return schema;
  }
}
var ZodObject = class _ZodObject extends ZodType {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext(ctx2, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx2.parsedType
      });
      return INVALID;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil.errToObj;
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum(util.objectKeys(this.shape));
  }
};
ZodObject.create = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.strictCreate = (shape, params) => {
  return new ZodObject({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
ZodObject.lazycreate = (shape, params) => {
  return new ZodObject({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever.create(),
    typeName: ZodFirstPartyTypeKind.ZodObject,
    ...processCreateParams(params)
  });
};
var ZodUnion = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError(issues2));
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union,
        unionErrors
      });
      return INVALID;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion.create = (types, params) => {
  return new ZodUnion({
    options: types,
    typeName: ZodFirstPartyTypeKind.ZodUnion,
    ...processCreateParams(params)
  });
};
var getDiscriminator = (type) => {
  if (type instanceof ZodLazy) {
    return getDiscriminator(type.schema);
  } else if (type instanceof ZodEffects) {
    return getDiscriminator(type.innerType());
  } else if (type instanceof ZodLiteral) {
    return [type.value];
  } else if (type instanceof ZodEnum) {
    return type.options;
  } else if (type instanceof ZodNativeEnum) {
    return util.objectValues(type.enum);
  } else if (type instanceof ZodDefault) {
    return getDiscriminator(type._def.innerType);
  } else if (type instanceof ZodUndefined) {
    return [void 0];
  } else if (type instanceof ZodNull) {
    return [null];
  } else if (type instanceof ZodOptional) {
    return [void 0, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodNullable) {
    return [null, ...getDiscriminator(type.unwrap())];
  } else if (type instanceof ZodBranded) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodReadonly) {
    return getDiscriminator(type.unwrap());
  } else if (type instanceof ZodCatch) {
    return getDiscriminator(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion({
      typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams(params)
    });
  }
};
function mergeValues(a, b) {
  const aType = getParsedType(a);
  const bType = getParsedType(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
    const bKeys = util.objectKeys(b);
    const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection = class extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted(parsedLeft) || isAborted(parsedRight)) {
        return INVALID;
      }
      const merged = mergeValues(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_intersection_types
        });
        return INVALID;
      }
      if (isDirty(parsedLeft) || isDirty(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection.create = (left, right, params) => {
  return new ZodIntersection({
    left,
    right,
    typeName: ZodFirstPartyTypeKind.ZodIntersection,
    ...processCreateParams(params)
  });
};
var ZodTuple = class _ZodTuple extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.array) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.array,
        received: ctx.parsedType
      });
      return INVALID;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus.mergeArray(status, results);
      });
    } else {
      return ParseStatus.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple({
      ...this._def,
      rest
    });
  }
};
ZodTuple.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple({
    items: schemas,
    typeName: ZodFirstPartyTypeKind.ZodTuple,
    rest: null,
    ...processCreateParams(params)
  });
};
var ZodRecord = class _ZodRecord extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.object) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.object,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType) {
      return new _ZodRecord({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(third)
      });
    }
    return new _ZodRecord({
      keyType: ZodString.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind.ZodRecord,
      ...processCreateParams(second)
    });
  }
};
var ZodMap = class extends ZodType {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.map) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.map,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap.create = (keyType, valueType, params) => {
  return new ZodMap({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind.ZodMap,
    ...processCreateParams(params)
  });
};
var ZodSet = class _ZodSet extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.set) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.set,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet({
      ...this._def,
      minSize: { value: minSize, message: errorUtil.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet.create = (valueType, params) => {
  return new ZodSet({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind.ZodSet,
    ...processCreateParams(params)
  });
};
var ZodFunction = class _ZodFunction extends ZodType {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.function) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.function,
        received: ctx.parsedType
      });
      return INVALID;
    }
    function makeArgsIssue(args, error) {
      return makeIssue({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise) {
      const me = this;
      return OK(async function(...args) {
        const error = new ZodError([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction({
      ...this._def,
      args: ZodTuple.create(items).rest(ZodUnknown.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction({
      args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
      returns: returns || ZodUnknown.create(),
      typeName: ZodFirstPartyTypeKind.ZodFunction,
      ...processCreateParams(params)
    });
  }
};
var ZodLazy = class extends ZodType {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy.create = (getter, params) => {
  return new ZodLazy({
    getter,
    typeName: ZodFirstPartyTypeKind.ZodLazy,
    ...processCreateParams(params)
  });
};
var ZodLiteral = class extends ZodType {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_literal,
        expected: this._def.value
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral.create = (value, params) => {
  return new ZodLiteral({
    value,
    typeName: ZodFirstPartyTypeKind.ZodLiteral,
    ...processCreateParams(params)
  });
};
function createZodEnum(values, params) {
  return new ZodEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodEnum,
    ...processCreateParams(params)
  });
}
var ZodEnum = class _ZodEnum extends ZodType {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
  _parse(input) {
    const nativeEnumValues = util.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        expected: util.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode.invalid_type
      });
      return INVALID;
    }
    if (!this._cache) {
      this._cache = new Set(util.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util.objectValues(nativeEnumValues);
      addIssueToContext(ctx, {
        received: ctx.data,
        code: ZodIssueCode.invalid_enum_value,
        options: expectedValues
      });
      return INVALID;
    }
    return OK(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum.create = (values, params) => {
  return new ZodNativeEnum({
    values,
    typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
    ...processCreateParams(params)
  });
};
var ZodPromise = class extends ZodType {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.promise,
        received: ctx.parsedType
      });
      return INVALID;
    }
    const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise.create = (schema, params) => {
  return new ZodPromise({
    type: schema,
    typeName: ZodFirstPartyTypeKind.ZodPromise,
    ...processCreateParams(params)
  });
};
var ZodEffects = class extends ZodType {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID;
        if (result.status === "dirty")
          return DIRTY(result.value);
        if (status.value === "dirty")
          return DIRTY(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid(base))
          return INVALID;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid(base))
            return INVALID;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util.assertNever(effect);
  }
};
ZodEffects.create = (schema, effect, params) => {
  return new ZodEffects({
    schema,
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    effect,
    ...processCreateParams(params)
  });
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind.ZodEffects,
    ...processCreateParams(params)
  });
};
var ZodOptional = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.undefined) {
      return OK(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional.create = (type, params) => {
  return new ZodOptional({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodOptional,
    ...processCreateParams(params)
  });
};
var ZodNullable = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType.null) {
      return OK(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable.create = (type, params) => {
  return new ZodNullable({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodNullable,
    ...processCreateParams(params)
  });
};
var ZodDefault = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault.create = (type, params) => {
  return new ZodDefault({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams(params)
  });
};
var ZodCatch = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch.create = (type, params) => {
  return new ZodCatch({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams(params)
  });
};
var ZodNaN = class extends ZodType {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.nan,
        received: ctx.parsedType
      });
      return INVALID;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN.create = (params) => {
  return new ZodNaN({
    typeName: ZodFirstPartyTypeKind.ZodNaN,
    ...processCreateParams(params)
  });
};
var BRAND = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded = class extends ZodType {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline = class _ZodPipeline extends ZodType {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind.ZodPipeline
    });
  }
};
var ZodReadonly = class extends ZodType {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly.create = (type, params) => {
  return new ZodReadonly({
    innerType: type,
    typeName: ZodFirstPartyTypeKind.ZodReadonly,
    ...processCreateParams(params)
  });
};
function cleanParams(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom(check, _params = {}, fatal) {
  if (check)
    return ZodAny.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny.create();
}
var late = {
  object: ZodObject.lazycreate
};
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind22) {
  ZodFirstPartyTypeKind22["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind22["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind22["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind22["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind22["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind22["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind22["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind22["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind22["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind22["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind22["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind22["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind22["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind22["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind22["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind22["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind22["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind22["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind22["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind22["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind22["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind22["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind22["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind22["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind22["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind22["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind22["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind22["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind22["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind22["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind22["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind22["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind22["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind22["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind22["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind22["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var instanceOfType = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom((data) => data instanceof cls, params);
var stringType = ZodString.create;
var numberType = ZodNumber.create;
var nanType = ZodNaN.create;
var bigIntType = ZodBigInt.create;
var booleanType = ZodBoolean.create;
var dateType = ZodDate.create;
var symbolType = ZodSymbol.create;
var undefinedType = ZodUndefined.create;
var nullType = ZodNull.create;
var anyType = ZodAny.create;
var unknownType = ZodUnknown.create;
var neverType = ZodNever.create;
var voidType = ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
var strictObjectType = ZodObject.strictCreate;
var unionType = ZodUnion.create;
var discriminatedUnionType = ZodDiscriminatedUnion.create;
var intersectionType = ZodIntersection.create;
var tupleType = ZodTuple.create;
var recordType = ZodRecord.create;
var mapType = ZodMap.create;
var setType = ZodSet.create;
var functionType = ZodFunction.create;
var lazyType = ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
var nativeEnumType = ZodNativeEnum.create;
var promiseType = ZodPromise.create;
var effectsType = ZodEffects.create;
var optionalType = ZodOptional.create;
var nullableType = ZodNullable.create;
var preprocessType = ZodEffects.createWithPreprocess;
var pipelineType = ZodPipeline.create;
var ostring = () => stringType().optional();
var onumber = () => numberType().optional();
var oboolean = () => booleanType().optional();
var coerce = {
  string: ((arg) => ZodString.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
};
var NEVER = INVALID;
var OFFERS_OPT_IN_PHRASES = { en: "YES OFFERS", es: "SI OFERTAS" };
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
var BRAIN_INTENTS = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS],
      description: "What the customer is after."
    },
    escalate: {
      type: "boolean",
      description: "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so."
    },
    reason: {
      type: "string",
      description: "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies."
    },
    confidence: {
      type: "number",
      description: "How sure you are that this reply is right and complete for this customer, from 0 to 1."
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description: "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none."
    },
    language: {
      type: "string",
      enum: [...BRAIN_LANGUAGES],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema = external_exports.object({
  reply: external_exports.string(),
  intent: external_exports.enum(BRAIN_INTENTS).catch("other"),
  escalate: external_exports.boolean().catch(false),
  reason: external_exports.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: external_exports.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: external_exports.array(external_exports.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: external_exports.enum(BRAIN_LANGUAGES).catch("other")
});
var WA_WINDOW_MS = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS = 10 * 60 * 1e3;
var CALL_OUTCOMES = ["answered", "booking_link_sent", "callback_needed", "voicemail", "no_request", "other"];
var TIME_FMT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var POLICY_CLASS_WORDS = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema = external_exports.object({
  max_replies_day: external_exports.number().int().min(1).max(200).optional(),
  pause_hours: external_exports.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: external_exports.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: external_exports.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: external_exports.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME = external_exports.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema = external_exports.object({ open: TIME, close: TIME });
var HoursSchema = external_exports.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME.nullable().optional(),
  close: TIME.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: external_exports.array(IntervalSchema).optional()
}).strict();
var DATE = external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema = external_exports.object({
  date: DATE,
  until: DATE.optional(),
  note: external_exports.string().max(200).optional()
});
var DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema = external_exports.object({
  name: external_exports.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: external_exports.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: external_exports.string().max(120).optional()
}).strict();
var GuardrailsSchema = external_exports.object({
  never_quote_prices: external_exports.boolean().optional(),
  never_confirm_booking: external_exports.boolean().optional(),
  disclose_ai: external_exports.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: external_exports.boolean().optional()
}).strict();
var NoteSchema = external_exports.object({
  title: external_exports.string().min(1).max(80),
  text: external_exports.string().min(1).max(1200)
}).strict();
var BookingRulesSchema = external_exports.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: external_exports.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: external_exports.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: external_exports.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: external_exports.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: external_exports.array(external_exports.string().min(1).max(80)).max(20).optional(),
  party_max: external_exports.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: external_exports.array(external_exports.string().min(1).max(200)).max(10).optional()
}).strict();
var E164 = /^\+[1-9]\d{6,14}$/;
var BusinessProfileSchema = external_exports.object({
  address: external_exports.string().max(300).optional(),
  hours: external_exports.record(external_exports.enum(DAYS), HoursSchema).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: external_exports.array(ClosureSchema).optional(),
  services: external_exports.array(ServiceSchema).max(60).optional(),
  languages: external_exports.array(external_exports.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: external_exports.array(external_exports.string().min(1).max(200)).max(20).optional(),
  tone: external_exports.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: external_exports.string().regex(E164, "E.164, like +16469325775").optional(),
  website: external_exports.string().url().max(500).optional(),
  notes: external_exports.array(NoteSchema).max(10).optional(),
  booking_rules: BookingRulesSchema.optional(),
  /**
   * Anything the owner wants said that no field covers.
   *
   * The escape hatch that keeps this model honest — without it, structuring
   * the facts would mean losing whatever did not fit, and the first migration
   * would be a downgrade.
   */
  extra_instructions: external_exports.string().max(8e3).optional()
}).strict();
var BrainConfigSchema = external_exports.object({
  business_name: external_exports.string().min(1).max(120),
  /**
   * The number the receptionist tells customers to call — an OVERRIDE, and
   * optional because it should almost never be set.
   *
   * It was required, free text, and named the same as the line the
   * receptionist answers, so every workspace typed something into it and
   * nothing checked what. On the first live salon that produced a
   * receptionist publishing the number it transfers to: customers who rang
   * it reached a person's mobile and never the receptionist standing by,
   * and the same string went to Google.
   *
   * Absent is now the right answer and the default: resolveFacts falls back
   * to the provisioned voice line, formatted for speech, so the number
   * published is the number answered by construction. A value here means a
   * business deliberately publishes something else — a tracking line, a
   * shopfront — and the pane says so in those words.
   */
  phone_display: external_exports.string().min(3).max(40).optional(),
  booking_link: external_exports.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: external_exports.string().min(40).max(2e4),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema.optional(),
  fallbacks: external_exports.object({
    /** Sent when no model key is configured. */
    greeting: external_exports.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: external_exports.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: external_exports.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema = external_exports.object({
  escalation_emails: external_exports.array(external_exports.string().email()).min(1).max(10),
  from: external_exports.string().max(200).optional()
}).strict();
var CalendarConfigSchema = external_exports.object({
  ical_url: external_exports.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema = external_exports.object({ vision: external_exports.boolean().optional() }).strict();
var TenantConfigSchema = external_exports.object({
  brain: BrainConfigSchema.optional(),
  notifications: NotificationsConfigSchema.optional(),
  calendar: CalendarConfigSchema.optional(),
  features: FeaturesConfigSchema.optional()
});
var MAX_INTERVALS_PER_DAY = 4;
var MAX_CLOSURES = 60;
function isRealDate(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay(h, day, ctx) {
  const name = DAY_NAME[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: external_exports.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate(c.date)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate(c.until)) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema = TenantConfigSchema.superRefine((cfg, ctx) => {
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES) {
    ctx.addIssue({
      code: external_exports.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure(c, n, ctx));
});
var SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS = 10 * 60 * 1e3;
var DAY_MS2 = 864e5;
var WEEK_MS2 = 7 * DAY_MS2;
var MONTH_MS = 30 * DAY_MS2;
var NEW_WINDOW_MS = 7 * DAY_MS2;
var QUIET_AFTER_MS = 30 * DAY_MS2;
var DATE_FMT2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DATE_YEAR_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" });
var TIME_FMT2 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DAY_MS3 = 24 * 3600 * 1e3;
var ASK_CAPS = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10
};
var ASK_CITATION_KINDS = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "The answer, in the person's language: two or three short sentences, under sixty words, unless they asked for detail (a transcript, a list). Plain text only: no markdown, no headings, and never a tag such as <answer> or <parameter> inside this string. More than two items go one per line, separated by newlines. Say what you found; if a read returned nothing, say so plainly."
    },
    citations: {
      type: "array",
      description: "The rows the answer rests on, taken ONLY from what the tools returned this turn, at most four \u2014 the ones the answer names. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ASK_CITATION_KINDS] },
          id: { type: "string" },
          label: { type: "string" }
        },
        required: ["kind", "id", "label"],
        additionalProperties: false
      }
    },
    followups: {
      type: "array",
      description: "Up to two short questions the person might ask next, in their language. Empty when nothing natural follows.",
      items: { type: "string" }
    },
    navigate: {
      type: "object",
      description: "When the best answer is a page, the route to open and a label. to: the exact `route` field a tool returned for a row (a call, a thread, a person), or a page route (today, inbox, clients, conversations, live, reports, admin/workspace). Empty strings when there is nothing to open. now: true when the person asked to open, show or see that thing; the app goes there as soon as the answer is read, so keep the answer to one line.",
      properties: { to: { type: "string" }, label: { type: "string" }, now: { type: "boolean" } },
      required: ["to", "label", "now"],
      additionalProperties: false
    },
    language: { type: "string", enum: [...ASK_LANGUAGES] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema = external_exports.object({
  answer: external_exports.string().catch("").transform((s) => clip(1500)(cleanAnswer(s))),
  citations: external_exports.array(
    external_exports.object({
      kind: external_exports.enum(ASK_CITATION_KINDS).catch("page"),
      id: external_exports.string().catch("").transform(clip(200)),
      label: external_exports.string().catch("").transform(clip(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS.citations)),
  followups: external_exports.array(external_exports.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS.followups).map((s) => s.slice(0, 90))),
  navigate: external_exports.object({ to: external_exports.string().catch(""), label: external_exports.string().catch(""), now: external_exports.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: external_exports.enum(ASK_LANGUAGES).catch("other")
});
var AskProposalOutcomeSchema = external_exports.object({
  state: external_exports.enum(["done", "dismissed", "failed", "undone"]),
  receipt: external_exports.string().max(300).catch(""),
  atMs: external_exports.number().catch(0),
  undo: external_exports.record(external_exports.unknown()).nullable().optional()
});
var AskSettingsChangeSchema = external_exports.discriminatedUnion("op", [
  external_exports.object({ op: external_exports.literal("add_closure"), date: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: external_exports.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: external_exports.string().max(200).optional() }),
  external_exports.object({ op: external_exports.literal("set_hours"), day: external_exports.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: external_exports.string().regex(/^\d{2}:\d{2}$/).nullable(), close: external_exports.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  external_exports.object({ op: external_exports.literal("add_note"), title: external_exports.string().min(1).max(80), text: external_exports.string().min(1).max(1200) }),
  external_exports.object({ op: external_exports.literal("add_service"), name: external_exports.string().min(1).max(80), duration_min: external_exports.number().int().min(1).max(1440).optional() })
]);
var FIRST = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES = { ...FIRST, label: "Nombre" };
var BUSINESS_ES = { ...BUSINESS, label: "Nombre del negocio" };
var LINK_ES = { ...LINK, label: "Enlace de reservas" };
var WHEN = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES = { ...WHEN, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES = { ...SERVICE, label: "Servicio", example: "una consulta" };
var LIMIT_TIERS = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var DAY_MS4 = 864e5;
var PLAYBOOK_BREATH_MS = 7 * DAY_MS4;
var PLAYBOOK_VETO_DELAY_MS = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short
};
var DATE_FMT3 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS5 = 864e5;
var QUIET_AFTER_MS2 = 7 * DAY_MS5;
var DATE_FMT4 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS = 14 * 864e5;
var REVIEW_NEWS_MS = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS = 14 * 864e5;
var BOOTSTRAP_MS = 3600 * 1e3;
var DATE_FMT5 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS3 = 7 * 864e5;
var DATE_FMT6 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second.`
};
var SOLE_PROP_CEILING_SENTENCE = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE}`;
var SIGNUP_NAME_MIN = 2;
var SIGNUP_NAME_MAX = 120;
var SignupSchema = external_exports.object({
  name: external_exports.string().trim().min(SIGNUP_NAME_MIN, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX, "That name is too long \u2014 120 characters at most."),
  email: external_exports.string().trim().toLowerCase().email("Enter a work email address.").max(254),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: external_exports.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: external_exports.string().trim().max(80).optional()
}).strict();
var CONSENT_PHRASE = OFFERS_OPT_IN_PHRASES.en;
var CONSENT_PHRASE_ES = OFFERS_OPT_IN_PHRASES.es;
var GRAPH = "https://graph.facebook.com/v25.0";
var SEND_TIMEOUT_MS = 15e3;
async function postGraph(cfg, payload) {
  try {
    const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });
    const out = await r.json().catch(() => ({}));
    return {
      ok: r.ok,
      wamid: out.messages?.[0]?.id ?? null,
      status: r.status,
      errorBody: r.ok ? void 0 : JSON.stringify(out).slice(0, 200)
    };
  } catch (e) {
    return { ok: false, wamid: null, status: 0, errorBody: e instanceof Error ? e.message : String(e) };
  }
}
async function sendText(cfg, to, body) {
  return postGraph(cfg, { messaging_product: "whatsapp", to, type: "text", text: { body } });
}
async function sendTemplate(cfg, to, template) {
  return postGraph(cfg, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components: template.params.length ? [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }] : []
    }
  });
}
var MEDIA_MAX_BYTES = 25 * 1024 * 1024;
var CALL_ANALYSIS_FIELDS = [
  {
    type: "string",
    name: "caller_wanted",
    description: "What the caller wanted, in one short sentence in plain words, the way the business owner would say it. Start with the request itself, never with 'The user' or 'The caller'. Leave empty if they asked for nothing.",
    examples: ["Asked whether Saturday at 10 is free.", "Wanted Tuesday's hours and a price.", "Moved Friday's appointment to next week."]
  },
  {
    type: "enum",
    name: "outcome",
    description: "How the call ended for the caller. answered: their question was answered. booking_link_sent: the receptionist sent them the booking link. callback_needed: a person at the business has to call them back or follow up. voicemail: the call reached voicemail. no_request: they hung up, tested the line or asked for nothing. other: none of these.",
    choices: [...CALL_OUTCOMES]
  },
  {
    type: "string",
    name: "follow_up",
    description: "What a person at the business should do next for this caller, in one short sentence. Leave empty when nothing is needed.",
    examples: ["Call back to confirm a Saturday 10:00 gel manicure.", "Text the price list for highlights."]
  },
  {
    type: "string",
    name: "caller_name",
    description: "The caller's name exactly as they gave it. Leave empty if they did not say one.",
    examples: ["Ana", "Daniela R."]
  }
];
var API2 = "https://api.twilio.com/2010-04-01";
var TRUNKING = "https://trunking.twilio.com/v1";
var MESSAGING = "https://messaging.twilio.com/v1";
var twilioUrls = {
  subaccounts: `${API2}/Accounts.json`,
  availableLocal: (sid2, country = "US") => `${API2}/Accounts/${sid2}/AvailablePhoneNumbers/${country}/Local.json`,
  incomingNumbers: (sid2) => `${API2}/Accounts/${sid2}/IncomingPhoneNumbers.json`,
  incomingNumber: (sid2, numberSid) => `${API2}/Accounts/${sid2}/IncomingPhoneNumbers/${numberSid}.json`,
  credentialLists: (sid2) => `${API2}/Accounts/${sid2}/SIP/CredentialLists.json`,
  credentials: (sid2, listSid) => `${API2}/Accounts/${sid2}/SIP/CredentialLists/${listSid}/Credentials.json`,
  trunks: `${TRUNKING}/Trunks`,
  trunk: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}`,
  trunkCredentialLists: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/CredentialLists`,
  trunkOriginationUrls: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/OriginationUrls`,
  trunkPhoneNumbers: (trunkSid) => `${TRUNKING}/Trunks/${trunkSid}/PhoneNumbers`,
  messagingServices: `${MESSAGING}/Services`,
  serviceNumbers: (serviceSid) => `${MESSAGING}/Services/${serviceSid}/PhoneNumbers`,
  messages: (sid2) => `${API2}/Accounts/${sid2}/Messages.json`
};
var enc = new TextEncoder();
var FRESH_SLACK_MS = 2 * 864e5;
var STATE_TTL_MS = 10 * 6e4;
var enc2 = new TextEncoder();
var dec = new TextDecoder();

// ../../node_modules/zod/v3/external.js
var external_exports2 = {};
__export(external_exports2, {
  BRAND: () => BRAND2,
  DIRTY: () => DIRTY2,
  EMPTY_PATH: () => EMPTY_PATH2,
  INVALID: () => INVALID2,
  NEVER: () => NEVER2,
  OK: () => OK2,
  ParseStatus: () => ParseStatus2,
  Schema: () => ZodType2,
  ZodAny: () => ZodAny2,
  ZodArray: () => ZodArray2,
  ZodBigInt: () => ZodBigInt2,
  ZodBoolean: () => ZodBoolean2,
  ZodBranded: () => ZodBranded2,
  ZodCatch: () => ZodCatch2,
  ZodDate: () => ZodDate2,
  ZodDefault: () => ZodDefault2,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion2,
  ZodEffects: () => ZodEffects2,
  ZodEnum: () => ZodEnum2,
  ZodError: () => ZodError2,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind2,
  ZodFunction: () => ZodFunction2,
  ZodIntersection: () => ZodIntersection2,
  ZodIssueCode: () => ZodIssueCode2,
  ZodLazy: () => ZodLazy2,
  ZodLiteral: () => ZodLiteral2,
  ZodMap: () => ZodMap2,
  ZodNaN: () => ZodNaN2,
  ZodNativeEnum: () => ZodNativeEnum2,
  ZodNever: () => ZodNever2,
  ZodNull: () => ZodNull2,
  ZodNullable: () => ZodNullable2,
  ZodNumber: () => ZodNumber2,
  ZodObject: () => ZodObject2,
  ZodOptional: () => ZodOptional2,
  ZodParsedType: () => ZodParsedType2,
  ZodPipeline: () => ZodPipeline2,
  ZodPromise: () => ZodPromise2,
  ZodReadonly: () => ZodReadonly2,
  ZodRecord: () => ZodRecord2,
  ZodSchema: () => ZodType2,
  ZodSet: () => ZodSet2,
  ZodString: () => ZodString2,
  ZodSymbol: () => ZodSymbol2,
  ZodTransformer: () => ZodEffects2,
  ZodTuple: () => ZodTuple2,
  ZodType: () => ZodType2,
  ZodUndefined: () => ZodUndefined2,
  ZodUnion: () => ZodUnion2,
  ZodUnknown: () => ZodUnknown2,
  ZodVoid: () => ZodVoid2,
  addIssueToContext: () => addIssueToContext2,
  any: () => anyType2,
  array: () => arrayType2,
  bigint: () => bigIntType2,
  boolean: () => booleanType2,
  coerce: () => coerce2,
  custom: () => custom2,
  date: () => dateType2,
  datetimeRegex: () => datetimeRegex2,
  defaultErrorMap: () => en_default2,
  discriminatedUnion: () => discriminatedUnionType2,
  effect: () => effectsType2,
  enum: () => enumType2,
  function: () => functionType2,
  getErrorMap: () => getErrorMap2,
  getParsedType: () => getParsedType2,
  instanceof: () => instanceOfType2,
  intersection: () => intersectionType2,
  isAborted: () => isAborted2,
  isAsync: () => isAsync2,
  isDirty: () => isDirty2,
  isValid: () => isValid2,
  late: () => late2,
  lazy: () => lazyType2,
  literal: () => literalType2,
  makeIssue: () => makeIssue2,
  map: () => mapType2,
  nan: () => nanType2,
  nativeEnum: () => nativeEnumType2,
  never: () => neverType2,
  null: () => nullType2,
  nullable: () => nullableType2,
  number: () => numberType2,
  object: () => objectType2,
  objectUtil: () => objectUtil2,
  oboolean: () => oboolean2,
  onumber: () => onumber2,
  optional: () => optionalType2,
  ostring: () => ostring2,
  pipeline: () => pipelineType2,
  preprocess: () => preprocessType2,
  promise: () => promiseType2,
  quotelessJson: () => quotelessJson2,
  record: () => recordType2,
  set: () => setType2,
  setErrorMap: () => setErrorMap2,
  strictObject: () => strictObjectType2,
  string: () => stringType2,
  symbol: () => symbolType2,
  transformer: () => effectsType2,
  tuple: () => tupleType2,
  undefined: () => undefinedType2,
  union: () => unionType2,
  unknown: () => unknownType2,
  util: () => util2,
  void: () => voidType2
});

// ../../node_modules/zod/v3/helpers/util.js
var util2;
(function(util4) {
  util4.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util4.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util4.assertNever = assertNever;
  util4.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util4.getValidEnumValues = (obj) => {
    const validKeys = util4.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util4.objectValues(filtered);
  };
  util4.objectValues = (obj) => {
    return util4.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util4.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util4.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util4.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util4.joinValues = joinValues;
  util4.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util2 || (util2 = {}));
var objectUtil2;
(function(objectUtil4) {
  objectUtil4.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil2 || (objectUtil2 = {}));
var ZodParsedType2 = util2.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType2 = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType2.undefined;
    case "string":
      return ZodParsedType2.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType2.nan : ZodParsedType2.number;
    case "boolean":
      return ZodParsedType2.boolean;
    case "function":
      return ZodParsedType2.function;
    case "bigint":
      return ZodParsedType2.bigint;
    case "symbol":
      return ZodParsedType2.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType2.array;
      }
      if (data === null) {
        return ZodParsedType2.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType2.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType2.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType2.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType2.date;
      }
      return ZodParsedType2.object;
    default:
      return ZodParsedType2.unknown;
  }
};

// ../../node_modules/zod/v3/ZodError.js
var ZodIssueCode2 = util2.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson2 = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError2 = class _ZodError3 extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError3)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util2.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError2.create = (issues) => {
  const error = new ZodError2(issues);
  return error;
};

// ../../node_modules/zod/v3/locales/en.js
var errorMap2 = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode2.invalid_type:
      if (issue.received === ZodParsedType2.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode2.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util2.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode2.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util2.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode2.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode2.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util2.joinValues(issue.options)}`;
      break;
    case ZodIssueCode2.invalid_enum_value:
      message = `Invalid enum value. Expected ${util2.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode2.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode2.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode2.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode2.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util2.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode2.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode2.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode2.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode2.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode2.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode2.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util2.assertNever(issue);
  }
  return { message };
};
var en_default2 = errorMap2;

// ../../node_modules/zod/v3/errors.js
var overrideErrorMap2 = en_default2;
function setErrorMap2(map) {
  overrideErrorMap2 = map;
}
function getErrorMap2() {
  return overrideErrorMap2;
}

// ../../node_modules/zod/v3/helpers/parseUtil.js
var makeIssue2 = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH2 = [];
function addIssueToContext2(ctx, issueData) {
  const overrideMap = getErrorMap2();
  const issue = makeIssue2({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default2 ? void 0 : en_default2
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus2 = class _ParseStatus3 {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID2;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus3.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID2;
      if (value.status === "aborted")
        return INVALID2;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID2 = Object.freeze({
  status: "aborted"
});
var DIRTY2 = (value) => ({ status: "dirty", value });
var OK2 = (value) => ({ status: "valid", value });
var isAborted2 = (x) => x.status === "aborted";
var isDirty2 = (x) => x.status === "dirty";
var isValid2 = (x) => x.status === "valid";
var isAsync2 = (x) => typeof Promise !== "undefined" && x instanceof Promise;

// ../../node_modules/zod/v3/helpers/errorUtil.js
var errorUtil2;
(function(errorUtil4) {
  errorUtil4.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil4.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil2 || (errorUtil2 = {}));

// ../../node_modules/zod/v3/types.js
var ParseInputLazyPath2 = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult2 = (ctx, result) => {
  if (isValid2(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError2(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams2(params) {
  if (!params)
    return {};
  const { errorMap: errorMap4, invalid_type_error, required_error, description } = params;
  if (errorMap4 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap4)
    return { errorMap: errorMap4, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType2 = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType2(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType2(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus2(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType2(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync2(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType2(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult2(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType2(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid2(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid2(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType2(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync2(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult2(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode2.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects2({
      schema: this,
      typeName: ZodFirstPartyTypeKind2.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional2.create(this, this._def);
  }
  nullable() {
    return ZodNullable2.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray2.create(this);
  }
  promise() {
    return ZodPromise2.create(this, this._def);
  }
  or(option) {
    return ZodUnion2.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection2.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects2({
      ...processCreateParams2(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind2.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault2({
      ...processCreateParams2(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind2.ZodDefault
    });
  }
  brand() {
    return new ZodBranded2({
      typeName: ZodFirstPartyTypeKind2.ZodBranded,
      type: this,
      ...processCreateParams2(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch2({
      ...processCreateParams2(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind2.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline2.create(this, target);
  }
  readonly() {
    return ZodReadonly2.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex2 = /^c[^\s-]{8,}$/i;
var cuid2Regex2 = /^[0-9a-z]+$/;
var ulidRegex2 = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex2 = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex2 = /^[a-z0-9_-]{21}$/i;
var jwtRegex2 = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex2 = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex2 = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex2 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex2;
var ipv4Regex2 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex2 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex2 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex2 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex2 = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex2 = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource2 = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex2 = new RegExp(`^${dateRegexSource2}$`);
function timeRegexSource2(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex2(args) {
  return new RegExp(`^${timeRegexSource2(args)}$`);
}
function datetimeRegex2(args) {
  let regex = `${dateRegexSource2}T${timeRegexSource2(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP2(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex2.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex2.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT2(jwt, alg) {
  if (!jwtRegex2.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr2(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex2.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex2.test(ip)) {
    return true;
  }
  return false;
}
var ZodString2 = class _ZodString3 extends ZodType2 {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext2(ctx2, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.string,
        received: ctx2.parsedType
      });
      return INVALID2;
    }
    const status = new ParseStatus2();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext2(ctx, {
              code: ZodIssueCode2.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext2(ctx, {
              code: ZodIssueCode2.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "email",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex2) {
          emojiRegex2 = new RegExp(_emojiRegex2, "u");
        }
        if (!emojiRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "emoji",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "uuid",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "nanoid",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "cuid",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "cuid2",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "ulid",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "url",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "regex",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex2(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex2;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex2(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "duration",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP2(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "ip",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT2(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "jwt",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr2(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "cidr",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "base64",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex2.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            validation: "base64url",
            code: ZodIssueCode2.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util2.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode2.invalid_string,
      ...errorUtil2.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString3({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil2.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil2.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil2.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil2.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil2.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil2.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil2.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil2.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil2.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil2.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil2.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil2.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil2.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil2.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil2.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil2.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil2.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil2.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil2.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil2.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil2.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil2.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil2.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil2.errToObj(message));
  }
  trim() {
    return new _ZodString3({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString3({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString3({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString2.create = (params) => {
  return new ZodString2({
    checks: [],
    typeName: ZodFirstPartyTypeKind2.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams2(params)
  });
};
function floatSafeRemainder2(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber2 = class _ZodNumber3 extends ZodType2 {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext2(ctx2, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.number,
        received: ctx2.parsedType
      });
      return INVALID2;
    }
    let ctx = void 0;
    const status = new ParseStatus2();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util2.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder2(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util2.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil2.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil2.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil2.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil2.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber3({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil2.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber3({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil2.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil2.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil2.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil2.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil2.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil2.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil2.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil2.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil2.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util2.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber2.create = (params) => {
  return new ZodNumber2({
    checks: [],
    typeName: ZodFirstPartyTypeKind2.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams2(params)
  });
};
var ZodBigInt2 = class _ZodBigInt3 extends ZodType2 {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus2();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util2.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext2(ctx, {
      code: ZodIssueCode2.invalid_type,
      expected: ZodParsedType2.bigint,
      received: ctx.parsedType
    });
    return INVALID2;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil2.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil2.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil2.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil2.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt3({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil2.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt3({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil2.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil2.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil2.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil2.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil2.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt2.create = (params) => {
  return new ZodBigInt2({
    checks: [],
    typeName: ZodFirstPartyTypeKind2.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams2(params)
  });
};
var ZodBoolean2 = class extends ZodType2 {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.boolean,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
};
ZodBoolean2.create = (params) => {
  return new ZodBoolean2({
    typeName: ZodFirstPartyTypeKind2.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams2(params)
  });
};
var ZodDate2 = class _ZodDate3 extends ZodType2 {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext2(ctx2, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.date,
        received: ctx2.parsedType
      });
      return INVALID2;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext2(ctx2, {
        code: ZodIssueCode2.invalid_date
      });
      return INVALID2;
    }
    const status = new ParseStatus2();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util2.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate3({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil2.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil2.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate2.create = (params) => {
  return new ZodDate2({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind2.ZodDate,
    ...processCreateParams2(params)
  });
};
var ZodSymbol2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.symbol,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
};
ZodSymbol2.create = (params) => {
  return new ZodSymbol2({
    typeName: ZodFirstPartyTypeKind2.ZodSymbol,
    ...processCreateParams2(params)
  });
};
var ZodUndefined2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.undefined,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
};
ZodUndefined2.create = (params) => {
  return new ZodUndefined2({
    typeName: ZodFirstPartyTypeKind2.ZodUndefined,
    ...processCreateParams2(params)
  });
};
var ZodNull2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.null,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
};
ZodNull2.create = (params) => {
  return new ZodNull2({
    typeName: ZodFirstPartyTypeKind2.ZodNull,
    ...processCreateParams2(params)
  });
};
var ZodAny2 = class extends ZodType2 {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK2(input.data);
  }
};
ZodAny2.create = (params) => {
  return new ZodAny2({
    typeName: ZodFirstPartyTypeKind2.ZodAny,
    ...processCreateParams2(params)
  });
};
var ZodUnknown2 = class extends ZodType2 {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK2(input.data);
  }
};
ZodUnknown2.create = (params) => {
  return new ZodUnknown2({
    typeName: ZodFirstPartyTypeKind2.ZodUnknown,
    ...processCreateParams2(params)
  });
};
var ZodNever2 = class extends ZodType2 {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext2(ctx, {
      code: ZodIssueCode2.invalid_type,
      expected: ZodParsedType2.never,
      received: ctx.parsedType
    });
    return INVALID2;
  }
};
ZodNever2.create = (params) => {
  return new ZodNever2({
    typeName: ZodFirstPartyTypeKind2.ZodNever,
    ...processCreateParams2(params)
  });
};
var ZodVoid2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.void,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
};
ZodVoid2.create = (params) => {
  return new ZodVoid2({
    typeName: ZodFirstPartyTypeKind2.ZodVoid,
    ...processCreateParams2(params)
  });
};
var ZodArray2 = class _ZodArray3 extends ZodType2 {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType2.array) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.array,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext2(ctx, {
          code: tooBig ? ZodIssueCode2.too_big : ZodIssueCode2.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext2(ctx, {
          code: ZodIssueCode2.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext2(ctx, {
          code: ZodIssueCode2.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath2(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus2.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath2(ctx, item, ctx.path, i));
    });
    return ParseStatus2.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray3({
      ...this._def,
      minLength: { value: minLength, message: errorUtil2.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray3({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil2.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray3({
      ...this._def,
      exactLength: { value: len, message: errorUtil2.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray2.create = (schema, params) => {
  return new ZodArray2({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind2.ZodArray,
    ...processCreateParams2(params)
  });
};
function deepPartialify2(schema) {
  if (schema instanceof ZodObject2) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional2.create(deepPartialify2(fieldSchema));
    }
    return new ZodObject2({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray2) {
    return new ZodArray2({
      ...schema._def,
      type: deepPartialify2(schema.element)
    });
  } else if (schema instanceof ZodOptional2) {
    return ZodOptional2.create(deepPartialify2(schema.unwrap()));
  } else if (schema instanceof ZodNullable2) {
    return ZodNullable2.create(deepPartialify2(schema.unwrap()));
  } else if (schema instanceof ZodTuple2) {
    return ZodTuple2.create(schema.items.map((item) => deepPartialify2(item)));
  } else {
    return schema;
  }
}
var ZodObject2 = class _ZodObject3 extends ZodType2 {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util2.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext2(ctx2, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.object,
        received: ctx2.parsedType
      });
      return INVALID2;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever2 && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath2(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever2) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext2(ctx, {
            code: ZodIssueCode2.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath2(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus2.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus2.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil2.errToObj;
    return new _ZodObject3({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil2.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject3({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject3({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject3({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject3({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind2.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject3({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util2.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject3({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util2.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject3({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify2(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util2.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject3({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util2.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional2) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject3({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum2(util2.objectKeys(this.shape));
  }
};
ZodObject2.create = (shape, params) => {
  return new ZodObject2({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever2.create(),
    typeName: ZodFirstPartyTypeKind2.ZodObject,
    ...processCreateParams2(params)
  });
};
ZodObject2.strictCreate = (shape, params) => {
  return new ZodObject2({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever2.create(),
    typeName: ZodFirstPartyTypeKind2.ZodObject,
    ...processCreateParams2(params)
  });
};
ZodObject2.lazycreate = (shape, params) => {
  return new ZodObject2({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever2.create(),
    typeName: ZodFirstPartyTypeKind2.ZodObject,
    ...processCreateParams2(params)
  });
};
var ZodUnion2 = class extends ZodType2 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError2(result.ctx.common.issues));
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_union,
        unionErrors
      });
      return INVALID2;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError2(issues2));
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_union,
        unionErrors
      });
      return INVALID2;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion2.create = (types, params) => {
  return new ZodUnion2({
    options: types,
    typeName: ZodFirstPartyTypeKind2.ZodUnion,
    ...processCreateParams2(params)
  });
};
var getDiscriminator2 = (type) => {
  if (type instanceof ZodLazy2) {
    return getDiscriminator2(type.schema);
  } else if (type instanceof ZodEffects2) {
    return getDiscriminator2(type.innerType());
  } else if (type instanceof ZodLiteral2) {
    return [type.value];
  } else if (type instanceof ZodEnum2) {
    return type.options;
  } else if (type instanceof ZodNativeEnum2) {
    return util2.objectValues(type.enum);
  } else if (type instanceof ZodDefault2) {
    return getDiscriminator2(type._def.innerType);
  } else if (type instanceof ZodUndefined2) {
    return [void 0];
  } else if (type instanceof ZodNull2) {
    return [null];
  } else if (type instanceof ZodOptional2) {
    return [void 0, ...getDiscriminator2(type.unwrap())];
  } else if (type instanceof ZodNullable2) {
    return [null, ...getDiscriminator2(type.unwrap())];
  } else if (type instanceof ZodBranded2) {
    return getDiscriminator2(type.unwrap());
  } else if (type instanceof ZodReadonly2) {
    return getDiscriminator2(type.unwrap());
  } else if (type instanceof ZodCatch2) {
    return getDiscriminator2(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion2 = class _ZodDiscriminatedUnion3 extends ZodType2 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.object) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.object,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID2;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator2(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion3({
      typeName: ZodFirstPartyTypeKind2.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams2(params)
    });
  }
};
function mergeValues2(a, b) {
  const aType = getParsedType2(a);
  const bType = getParsedType2(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType2.object && bType === ZodParsedType2.object) {
    const bKeys = util2.objectKeys(b);
    const sharedKeys = util2.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues2(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType2.array && bType === ZodParsedType2.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues2(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType2.date && bType === ZodParsedType2.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection2 = class extends ZodType2 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted2(parsedLeft) || isAborted2(parsedRight)) {
        return INVALID2;
      }
      const merged = mergeValues2(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext2(ctx, {
          code: ZodIssueCode2.invalid_intersection_types
        });
        return INVALID2;
      }
      if (isDirty2(parsedLeft) || isDirty2(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection2.create = (left, right, params) => {
  return new ZodIntersection2({
    left,
    right,
    typeName: ZodFirstPartyTypeKind2.ZodIntersection,
    ...processCreateParams2(params)
  });
};
var ZodTuple2 = class _ZodTuple3 extends ZodType2 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.array) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.array,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID2;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath2(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus2.mergeArray(status, results);
      });
    } else {
      return ParseStatus2.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple3({
      ...this._def,
      rest
    });
  }
};
ZodTuple2.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple2({
    items: schemas,
    typeName: ZodFirstPartyTypeKind2.ZodTuple,
    rest: null,
    ...processCreateParams2(params)
  });
};
var ZodRecord2 = class _ZodRecord3 extends ZodType2 {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.object) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.object,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath2(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath2(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus2.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus2.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType2) {
      return new _ZodRecord3({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind2.ZodRecord,
        ...processCreateParams2(third)
      });
    }
    return new _ZodRecord3({
      keyType: ZodString2.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind2.ZodRecord,
      ...processCreateParams2(second)
    });
  }
};
var ZodMap2 = class extends ZodType2 {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.map) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.map,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath2(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath2(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID2;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID2;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap2.create = (keyType, valueType, params) => {
  return new ZodMap2({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind2.ZodMap,
    ...processCreateParams2(params)
  });
};
var ZodSet2 = class _ZodSet3 extends ZodType2 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.set) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.set,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext2(ctx, {
          code: ZodIssueCode2.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext2(ctx, {
          code: ZodIssueCode2.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID2;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath2(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet3({
      ...this._def,
      minSize: { value: minSize, message: errorUtil2.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet3({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil2.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet2.create = (valueType, params) => {
  return new ZodSet2({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind2.ZodSet,
    ...processCreateParams2(params)
  });
};
var ZodFunction2 = class _ZodFunction3 extends ZodType2 {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.function) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.function,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    function makeArgsIssue(args, error) {
      return makeIssue2({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap2(), en_default2].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode2.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue2({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap2(), en_default2].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode2.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise2) {
      const me = this;
      return OK2(async function(...args) {
        const error = new ZodError2([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK2(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError2([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError2([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction3({
      ...this._def,
      args: ZodTuple2.create(items).rest(ZodUnknown2.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction3({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction3({
      args: args ? args : ZodTuple2.create([]).rest(ZodUnknown2.create()),
      returns: returns || ZodUnknown2.create(),
      typeName: ZodFirstPartyTypeKind2.ZodFunction,
      ...processCreateParams2(params)
    });
  }
};
var ZodLazy2 = class extends ZodType2 {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy2.create = (getter, params) => {
  return new ZodLazy2({
    getter,
    typeName: ZodFirstPartyTypeKind2.ZodLazy,
    ...processCreateParams2(params)
  });
};
var ZodLiteral2 = class extends ZodType2 {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        received: ctx.data,
        code: ZodIssueCode2.invalid_literal,
        expected: this._def.value
      });
      return INVALID2;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral2.create = (value, params) => {
  return new ZodLiteral2({
    value,
    typeName: ZodFirstPartyTypeKind2.ZodLiteral,
    ...processCreateParams2(params)
  });
};
function createZodEnum2(values, params) {
  return new ZodEnum2({
    values,
    typeName: ZodFirstPartyTypeKind2.ZodEnum,
    ...processCreateParams2(params)
  });
}
var ZodEnum2 = class _ZodEnum3 extends ZodType2 {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext2(ctx, {
        expected: util2.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode2.invalid_type
      });
      return INVALID2;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext2(ctx, {
        received: ctx.data,
        code: ZodIssueCode2.invalid_enum_value,
        options: expectedValues
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum3.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum3.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum2.create = createZodEnum2;
var ZodNativeEnum2 = class extends ZodType2 {
  _parse(input) {
    const nativeEnumValues = util2.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType2.string && ctx.parsedType !== ZodParsedType2.number) {
      const expectedValues = util2.objectValues(nativeEnumValues);
      addIssueToContext2(ctx, {
        expected: util2.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode2.invalid_type
      });
      return INVALID2;
    }
    if (!this._cache) {
      this._cache = new Set(util2.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util2.objectValues(nativeEnumValues);
      addIssueToContext2(ctx, {
        received: ctx.data,
        code: ZodIssueCode2.invalid_enum_value,
        options: expectedValues
      });
      return INVALID2;
    }
    return OK2(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum2.create = (values, params) => {
  return new ZodNativeEnum2({
    values,
    typeName: ZodFirstPartyTypeKind2.ZodNativeEnum,
    ...processCreateParams2(params)
  });
};
var ZodPromise2 = class extends ZodType2 {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType2.promise && ctx.common.async === false) {
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.promise,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    const promisified = ctx.parsedType === ZodParsedType2.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK2(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise2.create = (schema, params) => {
  return new ZodPromise2({
    type: schema,
    typeName: ZodFirstPartyTypeKind2.ZodPromise,
    ...processCreateParams2(params)
  });
};
var ZodEffects2 = class extends ZodType2 {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind2.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext2(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID2;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID2;
          if (result.status === "dirty")
            return DIRTY2(result.value);
          if (status.value === "dirty")
            return DIRTY2(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID2;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID2;
        if (result.status === "dirty")
          return DIRTY2(result.value);
        if (status.value === "dirty")
          return DIRTY2(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID2;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID2;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid2(base))
          return INVALID2;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid2(base))
            return INVALID2;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util2.assertNever(effect);
  }
};
ZodEffects2.create = (schema, effect, params) => {
  return new ZodEffects2({
    schema,
    typeName: ZodFirstPartyTypeKind2.ZodEffects,
    effect,
    ...processCreateParams2(params)
  });
};
ZodEffects2.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects2({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind2.ZodEffects,
    ...processCreateParams2(params)
  });
};
var ZodOptional2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType2.undefined) {
      return OK2(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional2.create = (type, params) => {
  return new ZodOptional2({
    innerType: type,
    typeName: ZodFirstPartyTypeKind2.ZodOptional,
    ...processCreateParams2(params)
  });
};
var ZodNullable2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType2.null) {
      return OK2(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable2.create = (type, params) => {
  return new ZodNullable2({
    innerType: type,
    typeName: ZodFirstPartyTypeKind2.ZodNullable,
    ...processCreateParams2(params)
  });
};
var ZodDefault2 = class extends ZodType2 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType2.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault2.create = (type, params) => {
  return new ZodDefault2({
    innerType: type,
    typeName: ZodFirstPartyTypeKind2.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams2(params)
  });
};
var ZodCatch2 = class extends ZodType2 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync2(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError2(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError2(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch2.create = (type, params) => {
  return new ZodCatch2({
    innerType: type,
    typeName: ZodFirstPartyTypeKind2.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams2(params)
  });
};
var ZodNaN2 = class extends ZodType2 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType2.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext2(ctx, {
        code: ZodIssueCode2.invalid_type,
        expected: ZodParsedType2.nan,
        received: ctx.parsedType
      });
      return INVALID2;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN2.create = (params) => {
  return new ZodNaN2({
    typeName: ZodFirstPartyTypeKind2.ZodNaN,
    ...processCreateParams2(params)
  });
};
var BRAND2 = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded2 = class extends ZodType2 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline2 = class _ZodPipeline3 extends ZodType2 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID2;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY2(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID2;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline3({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind2.ZodPipeline
    });
  }
};
var ZodReadonly2 = class extends ZodType2 {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid2(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync2(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly2.create = (type, params) => {
  return new ZodReadonly2({
    innerType: type,
    typeName: ZodFirstPartyTypeKind2.ZodReadonly,
    ...processCreateParams2(params)
  });
};
function cleanParams2(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom2(check, _params = {}, fatal) {
  if (check)
    return ZodAny2.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams2(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams2(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny2.create();
}
var late2 = {
  object: ZodObject2.lazycreate
};
var ZodFirstPartyTypeKind2;
(function(ZodFirstPartyTypeKind4) {
  ZodFirstPartyTypeKind4["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind4["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind4["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind4["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind4["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind4["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind4["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind4["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind4["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind4["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind4["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind4["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind4["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind4["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind4["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind4["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind4["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind4["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind4["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind4["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind4["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind4["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind4["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind4["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind4["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind4["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind4["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind4["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind4["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind4["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind4["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind4["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind4["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind4["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind4["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind4["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind2 || (ZodFirstPartyTypeKind2 = {}));
var instanceOfType2 = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom2((data) => data instanceof cls, params);
var stringType2 = ZodString2.create;
var numberType2 = ZodNumber2.create;
var nanType2 = ZodNaN2.create;
var bigIntType2 = ZodBigInt2.create;
var booleanType2 = ZodBoolean2.create;
var dateType2 = ZodDate2.create;
var symbolType2 = ZodSymbol2.create;
var undefinedType2 = ZodUndefined2.create;
var nullType2 = ZodNull2.create;
var anyType2 = ZodAny2.create;
var unknownType2 = ZodUnknown2.create;
var neverType2 = ZodNever2.create;
var voidType2 = ZodVoid2.create;
var arrayType2 = ZodArray2.create;
var objectType2 = ZodObject2.create;
var strictObjectType2 = ZodObject2.strictCreate;
var unionType2 = ZodUnion2.create;
var discriminatedUnionType2 = ZodDiscriminatedUnion2.create;
var intersectionType2 = ZodIntersection2.create;
var tupleType2 = ZodTuple2.create;
var recordType2 = ZodRecord2.create;
var mapType2 = ZodMap2.create;
var setType2 = ZodSet2.create;
var functionType2 = ZodFunction2.create;
var lazyType2 = ZodLazy2.create;
var literalType2 = ZodLiteral2.create;
var enumType2 = ZodEnum2.create;
var nativeEnumType2 = ZodNativeEnum2.create;
var promiseType2 = ZodPromise2.create;
var effectsType2 = ZodEffects2.create;
var optionalType2 = ZodOptional2.create;
var nullableType2 = ZodNullable2.create;
var preprocessType2 = ZodEffects2.createWithPreprocess;
var pipelineType2 = ZodPipeline2.create;
var ostring2 = () => stringType2().optional();
var onumber2 = () => numberType2().optional();
var oboolean2 = () => booleanType2().optional();
var coerce2 = {
  string: ((arg) => ZodString2.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber2.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean2.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt2.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate2.create({ ...arg, coerce: true }))
};
var NEVER2 = INVALID2;

// ../contracts/dist/index.js
var OFFERS_OPT_IN_PHRASES2 = { en: "YES OFFERS", es: "SI OFERTAS" };
function isOptedOutContact(c) {
  return c.consent === "opted_out" || c.dnc === true;
}
function mayMessageFor(c, purpose, opts = {}) {
  if (isOptedOutContact(c)) return { ok: false, reason: "opted_out" };
  if (purpose === "marketing") {
    return c.marketing_consent === "opted_in" ? { ok: true, reason: null } : { ok: false, reason: "no_marketing_consent" };
  }
  if (opts.proactive && c.consent !== "opted_in") return { ok: false, reason: "not_opted_in" };
  return { ok: true, reason: null };
}
function purposeOfTemplate(category) {
  return category === "utility" || category === "authentication" ? "conversational" : "marketing";
}
var DAY_MS6 = 864e5;
var WEEK_MS4 = 7 * DAY_MS6;
var BRAIN_INTENTS2 = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES2 = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA2 = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS2],
      description: "What the customer is after."
    },
    escalate: {
      type: "boolean",
      description: "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so."
    },
    reason: {
      type: "string",
      description: "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies."
    },
    confidence: {
      type: "number",
      description: "How sure you are that this reply is right and complete for this customer, from 0 to 1."
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description: "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none."
    },
    language: {
      type: "string",
      enum: [...BRAIN_LANGUAGES2],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema2 = external_exports2.object({
  reply: external_exports2.string(),
  intent: external_exports2.enum(BRAIN_INTENTS2).catch("other"),
  escalate: external_exports2.boolean().catch(false),
  reason: external_exports2.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: external_exports2.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: external_exports2.array(external_exports2.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: external_exports2.enum(BRAIN_LANGUAGES2).catch("other")
});
var WA_WINDOW_MS2 = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS2 = 10 * 60 * 1e3;
var TIME_FMT3 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DATE_FMT7 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var POLICY_CLASS_WORDS2 = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema2 = external_exports2.object({
  max_replies_day: external_exports2.number().int().min(1).max(200).optional(),
  pause_hours: external_exports2.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: external_exports2.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: external_exports2.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: external_exports2.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME2 = external_exports2.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema2 = external_exports2.object({ open: TIME2, close: TIME2 });
var HoursSchema2 = external_exports2.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME2.nullable().optional(),
  close: TIME2.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: external_exports2.array(IntervalSchema2).optional()
}).strict();
var DATE2 = external_exports2.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema2 = external_exports2.object({
  date: DATE2,
  until: DATE2.optional(),
  note: external_exports2.string().max(200).optional()
});
var DAYS2 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema2 = external_exports2.object({
  name: external_exports2.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: external_exports2.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: external_exports2.string().max(120).optional()
}).strict();
var GuardrailsSchema2 = external_exports2.object({
  never_quote_prices: external_exports2.boolean().optional(),
  never_confirm_booking: external_exports2.boolean().optional(),
  disclose_ai: external_exports2.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: external_exports2.boolean().optional()
}).strict();
var NoteSchema2 = external_exports2.object({
  title: external_exports2.string().min(1).max(80),
  text: external_exports2.string().min(1).max(1200)
}).strict();
var BookingRulesSchema2 = external_exports2.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: external_exports2.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: external_exports2.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: external_exports2.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: external_exports2.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: external_exports2.array(external_exports2.string().min(1).max(80)).max(20).optional(),
  party_max: external_exports2.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: external_exports2.array(external_exports2.string().min(1).max(200)).max(10).optional()
}).strict();
var E1642 = /^\+[1-9]\d{6,14}$/;
var BusinessProfileSchema2 = external_exports2.object({
  address: external_exports2.string().max(300).optional(),
  hours: external_exports2.record(external_exports2.enum(DAYS2), HoursSchema2).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: external_exports2.array(ClosureSchema2).optional(),
  services: external_exports2.array(ServiceSchema2).max(60).optional(),
  languages: external_exports2.array(external_exports2.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema2.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: external_exports2.array(external_exports2.string().min(1).max(200)).max(20).optional(),
  tone: external_exports2.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: external_exports2.string().regex(E1642, "E.164, like +16469325775").optional(),
  website: external_exports2.string().url().max(500).optional(),
  notes: external_exports2.array(NoteSchema2).max(10).optional(),
  booking_rules: BookingRulesSchema2.optional(),
  /**
   * Anything the owner wants said that no field covers.
   *
   * The escape hatch that keeps this model honest — without it, structuring
   * the facts would mean losing whatever did not fit, and the first migration
   * would be a downgrade.
   */
  extra_instructions: external_exports2.string().max(8e3).optional()
}).strict();
var BrainConfigSchema2 = external_exports2.object({
  business_name: external_exports2.string().min(1).max(120),
  /**
   * The number the receptionist tells customers to call — an OVERRIDE, and
   * optional because it should almost never be set.
   *
   * It was required, free text, and named the same as the line the
   * receptionist answers, so every workspace typed something into it and
   * nothing checked what. On the first live salon that produced a
   * receptionist publishing the number it transfers to: customers who rang
   * it reached a person's mobile and never the receptionist standing by,
   * and the same string went to Google.
   *
   * Absent is now the right answer and the default: resolveFacts falls back
   * to the provisioned voice line, formatted for speech, so the number
   * published is the number answered by construction. A value here means a
   * business deliberately publishes something else — a tracking line, a
   * shopfront — and the pane says so in those words.
   */
  phone_display: external_exports2.string().min(3).max(40).optional(),
  booking_link: external_exports2.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: external_exports2.string().min(40).max(2e4),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema2.optional(),
  fallbacks: external_exports2.object({
    /** Sent when no model key is configured. */
    greeting: external_exports2.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: external_exports2.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: external_exports2.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema2 = external_exports2.object({
  escalation_emails: external_exports2.array(external_exports2.string().email()).min(1).max(10),
  from: external_exports2.string().max(200).optional()
}).strict();
var CalendarConfigSchema2 = external_exports2.object({
  ical_url: external_exports2.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema2 = external_exports2.object({ vision: external_exports2.boolean().optional() }).strict();
var TenantConfigSchema2 = external_exports2.object({
  brain: BrainConfigSchema2.optional(),
  notifications: NotificationsConfigSchema2.optional(),
  calendar: CalendarConfigSchema2.optional(),
  features: FeaturesConfigSchema2.optional()
});
var MAX_INTERVALS_PER_DAY2 = 4;
var MAX_CLOSURES2 = 60;
function isRealDate2(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME2 = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay2(h, day, ctx) {
  const name = DAY_NAME2[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY2) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY2} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: external_exports2.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: external_exports2.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure2(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate2(c.date)) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate2(c.until)) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema2 = TenantConfigSchema2.superRefine((cfg, ctx) => {
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay2(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES2) {
    ctx.addIssue({
      code: external_exports2.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES2} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure2(c, n, ctx));
});
function parseTenantConfigResult(raw) {
  const r = TenantConfigSchema2.safeParse(raw ?? {});
  if (r.success) return { ok: true, config: r.data };
  return {
    ok: false,
    issues: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
  };
}
function parseTenantConfig(raw) {
  const r = parseTenantConfigResult(raw);
  return r.ok ? r.config : null;
}
var SHORT2 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS2 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS2 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS2 = 10 * 60 * 1e3;
var DAY_MS22 = 864e5;
var WEEK_MS22 = 7 * DAY_MS22;
var MONTH_MS2 = 30 * DAY_MS22;
var NEW_WINDOW_MS2 = 7 * DAY_MS22;
var QUIET_AFTER_MS3 = 30 * DAY_MS22;
var DATE_FMT22 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DATE_YEAR_FMT2 = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" });
var TIME_FMT22 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DAY_MS32 = 24 * 3600 * 1e3;
var ASK_CAPS2 = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10
};
var ASK_CITATION_KINDS2 = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES2 = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA2 = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "The answer, in the person's language: two or three short sentences, under sixty words, unless they asked for detail (a transcript, a list). Plain text only: no markdown, no headings, and never a tag such as <answer> or <parameter> inside this string. More than two items go one per line, separated by newlines. Say what you found; if a read returned nothing, say so plainly."
    },
    citations: {
      type: "array",
      description: "The rows the answer rests on, taken ONLY from what the tools returned this turn, at most four \u2014 the ones the answer names. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ASK_CITATION_KINDS2] },
          id: { type: "string" },
          label: { type: "string" }
        },
        required: ["kind", "id", "label"],
        additionalProperties: false
      }
    },
    followups: {
      type: "array",
      description: "Up to two short questions the person might ask next, in their language. Empty when nothing natural follows.",
      items: { type: "string" }
    },
    navigate: {
      type: "object",
      description: "When the best answer is a page, the route to open and a label. to: the exact `route` field a tool returned for a row (a call, a thread, a person), or a page route (today, inbox, clients, conversations, live, reports, admin/workspace). Empty strings when there is nothing to open. now: true when the person asked to open, show or see that thing; the app goes there as soon as the answer is read, so keep the answer to one line.",
      properties: { to: { type: "string" }, label: { type: "string" }, now: { type: "boolean" } },
      required: ["to", "label", "now"],
      additionalProperties: false
    },
    language: { type: "string", enum: [...ASK_LANGUAGES2] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip2 = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT2 = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer2(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT2);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema2 = external_exports2.object({
  answer: external_exports2.string().catch("").transform((s) => clip2(1500)(cleanAnswer2(s))),
  citations: external_exports2.array(
    external_exports2.object({
      kind: external_exports2.enum(ASK_CITATION_KINDS2).catch("page"),
      id: external_exports2.string().catch("").transform(clip2(200)),
      label: external_exports2.string().catch("").transform(clip2(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS2.citations)),
  followups: external_exports2.array(external_exports2.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS2.followups).map((s) => s.slice(0, 90))),
  navigate: external_exports2.object({ to: external_exports2.string().catch(""), label: external_exports2.string().catch(""), now: external_exports2.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: external_exports2.enum(ASK_LANGUAGES2).catch("other")
});
var AskProposalOutcomeSchema2 = external_exports2.object({
  state: external_exports2.enum(["done", "dismissed", "failed", "undone"]),
  receipt: external_exports2.string().max(300).catch(""),
  atMs: external_exports2.number().catch(0),
  undo: external_exports2.record(external_exports2.unknown()).nullable().optional()
});
var AskSettingsChangeSchema2 = external_exports2.discriminatedUnion("op", [
  external_exports2.object({ op: external_exports2.literal("add_closure"), date: external_exports2.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: external_exports2.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: external_exports2.string().max(200).optional() }),
  external_exports2.object({ op: external_exports2.literal("set_hours"), day: external_exports2.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: external_exports2.string().regex(/^\d{2}:\d{2}$/).nullable(), close: external_exports2.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  external_exports2.object({ op: external_exports2.literal("add_note"), title: external_exports2.string().min(1).max(80), text: external_exports2.string().min(1).max(1200) }),
  external_exports2.object({ op: external_exports2.literal("add_service"), name: external_exports2.string().min(1).max(80), duration_min: external_exports2.number().int().min(1).max(1440).optional() })
]);
var FIRST2 = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS2 = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK2 = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES2 = { ...FIRST2, label: "Nombre" };
var BUSINESS_ES2 = { ...BUSINESS2, label: "Nombre del negocio" };
var LINK_ES2 = { ...LINK2, label: "Enlace de reservas" };
var WHEN3 = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE2 = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES2 = { ...WHEN3, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES2 = { ...SERVICE2, label: "Servicio", example: "una consulta" };
var BROADCAST_CHUNK = 25;
var BROADCAST_GAP_MS = 300;
function renderTemplate(body, params) {
  return String(body ?? "").replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = params[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : m;
  });
}
var LIMIT_TIERS2 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
function parseParamSpec(raw) {
  if (typeof raw === "string") {
    const m = /^@(first_name|business_name|booking_link|visit_when|visit_service)$/.exec(raw.trim());
    if (m) return { kind: m[1] };
    return { kind: "text", value: raw };
  }
  if (raw && typeof raw === "object") {
    const o = raw;
    if (o.kind === "text") return typeof o.value === "string" ? { kind: "text", value: o.value } : null;
    if (o.kind === "first_name" || o.kind === "business_name" || o.kind === "booking_link" || o.kind === "visit_when" || o.kind === "visit_service") return { kind: o.kind };
  }
  return null;
}
function firstNameOf(displayName, waProfileName) {
  const raw = (displayName || waProfileName || "").trim();
  if (!raw || /^[+\d(]/.test(raw)) return null;
  const first = raw.split(/\s+/)[0].replace(/[^\p{L}\p{M}'’-]/gu, "");
  return first ? first.slice(0, 30) : null;
}
function resolveParams(specs, f) {
  return specs.map((s) => {
    switch (s.kind) {
      case "text":
        return s.value;
      case "first_name":
        return f.firstName || "there";
      case "business_name":
        return f.businessName;
      case "booking_link":
        return f.bookingLink ?? "";
      case "visit_when":
        return f.visitWhen ?? "";
      case "visit_service":
        return f.visitService ?? "";
    }
  });
}
var DAY_MS42 = 864e5;
var PLAYBOOK_BREATH_MS2 = 7 * DAY_MS42;
var PLAYBOOK_VETO_DELAY_MS2 = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL2 = {
  reengage: POLICY_CLASS_WORDS2.reengage.short,
  campaign: POLICY_CLASS_WORDS2.campaign.short,
  booking: POLICY_CLASS_WORDS2.booking.short
};
var DATE_FMT32 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN22 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS52 = 864e5;
var QUIET_AFTER_MS22 = 7 * DAY_MS52;
var DATE_FMT42 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS2 = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS2 = 14 * 864e5;
var REVIEW_NEWS_MS2 = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS2 = 14 * 864e5;
var BOOTSTRAP_MS2 = 3600 * 1e3;
var DATE_FMT52 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS32 = 7 * 864e5;
var DATE_FMT62 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS2 = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS2 = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS2.messagesPerSecond} message a second.`
};
var SOLE_PROP_CEILING_SENTENCE2 = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS2.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE2 = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE2}`;
var SIGNUP_NAME_MIN2 = 2;
var SIGNUP_NAME_MAX2 = 120;
var SignupSchema2 = external_exports2.object({
  name: external_exports2.string().trim().min(SIGNUP_NAME_MIN2, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX2, "That name is too long \u2014 120 characters at most."),
  email: external_exports2.string().trim().toLowerCase().email("Enter a work email address.").max(254),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: external_exports2.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: external_exports2.string().trim().max(80).optional()
}).strict();
var CONSENT_PHRASE2 = OFFERS_OPT_IN_PHRASES2.en;
var CONSENT_PHRASE_ES2 = OFFERS_OPT_IN_PHRASES2.es;

// ../db/dist/index.js
var __defProp3 = Object.defineProperty;
var __export3 = (target, all) => {
  for (var name in all)
    __defProp3(target, name, { get: all[name], enumerable: true });
};
var external_exports3 = {};
__export3(external_exports3, {
  BRAND: () => BRAND3,
  DIRTY: () => DIRTY3,
  EMPTY_PATH: () => EMPTY_PATH3,
  INVALID: () => INVALID3,
  NEVER: () => NEVER3,
  OK: () => OK3,
  ParseStatus: () => ParseStatus3,
  Schema: () => ZodType3,
  ZodAny: () => ZodAny3,
  ZodArray: () => ZodArray3,
  ZodBigInt: () => ZodBigInt3,
  ZodBoolean: () => ZodBoolean3,
  ZodBranded: () => ZodBranded3,
  ZodCatch: () => ZodCatch3,
  ZodDate: () => ZodDate3,
  ZodDefault: () => ZodDefault3,
  ZodDiscriminatedUnion: () => ZodDiscriminatedUnion3,
  ZodEffects: () => ZodEffects3,
  ZodEnum: () => ZodEnum3,
  ZodError: () => ZodError3,
  ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind3,
  ZodFunction: () => ZodFunction3,
  ZodIntersection: () => ZodIntersection3,
  ZodIssueCode: () => ZodIssueCode3,
  ZodLazy: () => ZodLazy3,
  ZodLiteral: () => ZodLiteral3,
  ZodMap: () => ZodMap3,
  ZodNaN: () => ZodNaN3,
  ZodNativeEnum: () => ZodNativeEnum3,
  ZodNever: () => ZodNever3,
  ZodNull: () => ZodNull3,
  ZodNullable: () => ZodNullable3,
  ZodNumber: () => ZodNumber3,
  ZodObject: () => ZodObject3,
  ZodOptional: () => ZodOptional3,
  ZodParsedType: () => ZodParsedType3,
  ZodPipeline: () => ZodPipeline3,
  ZodPromise: () => ZodPromise3,
  ZodReadonly: () => ZodReadonly3,
  ZodRecord: () => ZodRecord3,
  ZodSchema: () => ZodType3,
  ZodSet: () => ZodSet3,
  ZodString: () => ZodString3,
  ZodSymbol: () => ZodSymbol3,
  ZodTransformer: () => ZodEffects3,
  ZodTuple: () => ZodTuple3,
  ZodType: () => ZodType3,
  ZodUndefined: () => ZodUndefined3,
  ZodUnion: () => ZodUnion3,
  ZodUnknown: () => ZodUnknown3,
  ZodVoid: () => ZodVoid3,
  addIssueToContext: () => addIssueToContext3,
  any: () => anyType3,
  array: () => arrayType3,
  bigint: () => bigIntType3,
  boolean: () => booleanType3,
  coerce: () => coerce3,
  custom: () => custom3,
  date: () => dateType3,
  datetimeRegex: () => datetimeRegex3,
  defaultErrorMap: () => en_default3,
  discriminatedUnion: () => discriminatedUnionType3,
  effect: () => effectsType3,
  enum: () => enumType3,
  function: () => functionType3,
  getErrorMap: () => getErrorMap3,
  getParsedType: () => getParsedType3,
  instanceof: () => instanceOfType3,
  intersection: () => intersectionType3,
  isAborted: () => isAborted3,
  isAsync: () => isAsync3,
  isDirty: () => isDirty3,
  isValid: () => isValid3,
  late: () => late3,
  lazy: () => lazyType3,
  literal: () => literalType3,
  makeIssue: () => makeIssue3,
  map: () => mapType3,
  nan: () => nanType3,
  nativeEnum: () => nativeEnumType3,
  never: () => neverType3,
  null: () => nullType3,
  nullable: () => nullableType3,
  number: () => numberType3,
  object: () => objectType3,
  objectUtil: () => objectUtil3,
  oboolean: () => oboolean3,
  onumber: () => onumber3,
  optional: () => optionalType3,
  ostring: () => ostring3,
  pipeline: () => pipelineType3,
  preprocess: () => preprocessType3,
  promise: () => promiseType3,
  quotelessJson: () => quotelessJson3,
  record: () => recordType3,
  set: () => setType3,
  setErrorMap: () => setErrorMap3,
  strictObject: () => strictObjectType3,
  string: () => stringType3,
  symbol: () => symbolType3,
  transformer: () => effectsType3,
  tuple: () => tupleType3,
  undefined: () => undefinedType3,
  union: () => unionType3,
  unknown: () => unknownType3,
  util: () => util3,
  void: () => voidType3
});
var util3;
(function(util22) {
  util22.assertEqual = (_) => {
  };
  function assertIs(_arg) {
  }
  util22.assertIs = assertIs;
  function assertNever(_x) {
    throw new Error();
  }
  util22.assertNever = assertNever;
  util22.arrayToEnum = (items) => {
    const obj = {};
    for (const item of items) {
      obj[item] = item;
    }
    return obj;
  };
  util22.getValidEnumValues = (obj) => {
    const validKeys = util22.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
    const filtered = {};
    for (const k of validKeys) {
      filtered[k] = obj[k];
    }
    return util22.objectValues(filtered);
  };
  util22.objectValues = (obj) => {
    return util22.objectKeys(obj).map(function(e) {
      return obj[e];
    });
  };
  util22.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
    const keys = [];
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        keys.push(key);
      }
    }
    return keys;
  };
  util22.find = (arr, checker) => {
    for (const item of arr) {
      if (checker(item))
        return item;
    }
    return void 0;
  };
  util22.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
  function joinValues(array, separator = " | ") {
    return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
  }
  util22.joinValues = joinValues;
  util22.jsonStringifyReplacer = (_, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
})(util3 || (util3 = {}));
var objectUtil3;
(function(objectUtil22) {
  objectUtil22.mergeShapes = (first, second) => {
    return {
      ...first,
      ...second
      // second overwrites first
    };
  };
})(objectUtil3 || (objectUtil3 = {}));
var ZodParsedType3 = util3.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]);
var getParsedType3 = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return ZodParsedType3.undefined;
    case "string":
      return ZodParsedType3.string;
    case "number":
      return Number.isNaN(data) ? ZodParsedType3.nan : ZodParsedType3.number;
    case "boolean":
      return ZodParsedType3.boolean;
    case "function":
      return ZodParsedType3.function;
    case "bigint":
      return ZodParsedType3.bigint;
    case "symbol":
      return ZodParsedType3.symbol;
    case "object":
      if (Array.isArray(data)) {
        return ZodParsedType3.array;
      }
      if (data === null) {
        return ZodParsedType3.null;
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return ZodParsedType3.promise;
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return ZodParsedType3.map;
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return ZodParsedType3.set;
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return ZodParsedType3.date;
      }
      return ZodParsedType3.object;
    default:
      return ZodParsedType3.unknown;
  }
};
var ZodIssueCode3 = util3.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]);
var quotelessJson3 = (obj) => {
  const json = JSON.stringify(obj, null, 2);
  return json.replace(/"([^"]+)":/g, "$1:");
};
var ZodError3 = class _ZodError2 extends Error {
  get errors() {
    return this.issues;
  }
  constructor(issues) {
    super();
    this.issues = [];
    this.addIssue = (sub) => {
      this.issues = [...this.issues, sub];
    };
    this.addIssues = (subs = []) => {
      this.issues = [...this.issues, ...subs];
    };
    const actualProto = new.target.prototype;
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(this, actualProto);
    } else {
      this.__proto__ = actualProto;
    }
    this.name = "ZodError";
    this.issues = issues;
  }
  format(_mapper) {
    const mapper = _mapper || function(issue) {
      return issue.message;
    };
    const fieldErrors = { _errors: [] };
    const processError = (error) => {
      for (const issue of error.issues) {
        if (issue.code === "invalid_union") {
          issue.unionErrors.map(processError);
        } else if (issue.code === "invalid_return_type") {
          processError(issue.returnTypeError);
        } else if (issue.code === "invalid_arguments") {
          processError(issue.argumentsError);
        } else if (issue.path.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < issue.path.length) {
            const el = issue.path[i];
            const terminal = i === issue.path.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    };
    processError(this);
    return fieldErrors;
  }
  static assert(value) {
    if (!(value instanceof _ZodError2)) {
      throw new Error(`Not a ZodError: ${value}`);
    }
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, util3.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(mapper = (issue) => issue.message) {
    const fieldErrors = {};
    const formErrors = [];
    for (const sub of this.issues) {
      if (sub.path.length > 0) {
        const firstEl = sub.path[0];
        fieldErrors[firstEl] = fieldErrors[firstEl] || [];
        fieldErrors[firstEl].push(mapper(sub));
      } else {
        formErrors.push(mapper(sub));
      }
    }
    return { formErrors, fieldErrors };
  }
  get formErrors() {
    return this.flatten();
  }
};
ZodError3.create = (issues) => {
  const error = new ZodError3(issues);
  return error;
};
var errorMap3 = (issue, _ctx) => {
  let message;
  switch (issue.code) {
    case ZodIssueCode3.invalid_type:
      if (issue.received === ZodParsedType3.undefined) {
        message = "Required";
      } else {
        message = `Expected ${issue.expected}, received ${issue.received}`;
      }
      break;
    case ZodIssueCode3.invalid_literal:
      message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util3.jsonStringifyReplacer)}`;
      break;
    case ZodIssueCode3.unrecognized_keys:
      message = `Unrecognized key(s) in object: ${util3.joinValues(issue.keys, ", ")}`;
      break;
    case ZodIssueCode3.invalid_union:
      message = `Invalid input`;
      break;
    case ZodIssueCode3.invalid_union_discriminator:
      message = `Invalid discriminator value. Expected ${util3.joinValues(issue.options)}`;
      break;
    case ZodIssueCode3.invalid_enum_value:
      message = `Invalid enum value. Expected ${util3.joinValues(issue.options)}, received '${issue.received}'`;
      break;
    case ZodIssueCode3.invalid_arguments:
      message = `Invalid function arguments`;
      break;
    case ZodIssueCode3.invalid_return_type:
      message = `Invalid function return type`;
      break;
    case ZodIssueCode3.invalid_date:
      message = `Invalid date`;
      break;
    case ZodIssueCode3.invalid_string:
      if (typeof issue.validation === "object") {
        if ("includes" in issue.validation) {
          message = `Invalid input: must include "${issue.validation.includes}"`;
          if (typeof issue.validation.position === "number") {
            message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
          }
        } else if ("startsWith" in issue.validation) {
          message = `Invalid input: must start with "${issue.validation.startsWith}"`;
        } else if ("endsWith" in issue.validation) {
          message = `Invalid input: must end with "${issue.validation.endsWith}"`;
        } else {
          util3.assertNever(issue.validation);
        }
      } else if (issue.validation !== "regex") {
        message = `Invalid ${issue.validation}`;
      } else {
        message = "Invalid";
      }
      break;
    case ZodIssueCode3.too_small:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "bigint")
        message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode3.too_big:
      if (issue.type === "array")
        message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
      else if (issue.type === "string")
        message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
      else if (issue.type === "number")
        message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "bigint")
        message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
      else if (issue.type === "date")
        message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
      else
        message = "Invalid input";
      break;
    case ZodIssueCode3.custom:
      message = `Invalid input`;
      break;
    case ZodIssueCode3.invalid_intersection_types:
      message = `Intersection results could not be merged`;
      break;
    case ZodIssueCode3.not_multiple_of:
      message = `Number must be a multiple of ${issue.multipleOf}`;
      break;
    case ZodIssueCode3.not_finite:
      message = "Number must be finite";
      break;
    default:
      message = _ctx.defaultError;
      util3.assertNever(issue);
  }
  return { message };
};
var en_default3 = errorMap3;
var overrideErrorMap3 = en_default3;
function setErrorMap3(map) {
  overrideErrorMap3 = map;
}
function getErrorMap3() {
  return overrideErrorMap3;
}
var makeIssue3 = (params) => {
  const { data, path, errorMaps, issueData } = params;
  const fullPath = [...path, ...issueData.path || []];
  const fullIssue = {
    ...issueData,
    path: fullPath
  };
  if (issueData.message !== void 0) {
    return {
      ...issueData,
      path: fullPath,
      message: issueData.message
    };
  }
  let errorMessage = "";
  const maps = errorMaps.filter((m) => !!m).slice().reverse();
  for (const map of maps) {
    errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
  }
  return {
    ...issueData,
    path: fullPath,
    message: errorMessage
  };
};
var EMPTY_PATH3 = [];
function addIssueToContext3(ctx, issueData) {
  const overrideMap = getErrorMap3();
  const issue = makeIssue3({
    issueData,
    data: ctx.data,
    path: ctx.path,
    errorMaps: [
      ctx.common.contextualErrorMap,
      // contextual error map is first priority
      ctx.schemaErrorMap,
      // then schema-bound map if available
      overrideMap,
      // then global override map
      overrideMap === en_default3 ? void 0 : en_default3
      // then global default map
    ].filter((x) => !!x)
  });
  ctx.common.issues.push(issue);
}
var ParseStatus3 = class _ParseStatus2 {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    if (this.value === "valid")
      this.value = "dirty";
  }
  abort() {
    if (this.value !== "aborted")
      this.value = "aborted";
  }
  static mergeArray(status, results) {
    const arrayValue = [];
    for (const s of results) {
      if (s.status === "aborted")
        return INVALID3;
      if (s.status === "dirty")
        status.dirty();
      arrayValue.push(s.value);
    }
    return { status: status.value, value: arrayValue };
  }
  static async mergeObjectAsync(status, pairs) {
    const syncPairs = [];
    for (const pair of pairs) {
      const key = await pair.key;
      const value = await pair.value;
      syncPairs.push({
        key,
        value
      });
    }
    return _ParseStatus2.mergeObjectSync(status, syncPairs);
  }
  static mergeObjectSync(status, pairs) {
    const finalObject = {};
    for (const pair of pairs) {
      const { key, value } = pair;
      if (key.status === "aborted")
        return INVALID3;
      if (value.status === "aborted")
        return INVALID3;
      if (key.status === "dirty")
        status.dirty();
      if (value.status === "dirty")
        status.dirty();
      if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
        finalObject[key.value] = value.value;
      }
    }
    return { status: status.value, value: finalObject };
  }
};
var INVALID3 = Object.freeze({
  status: "aborted"
});
var DIRTY3 = (value) => ({ status: "dirty", value });
var OK3 = (value) => ({ status: "valid", value });
var isAborted3 = (x) => x.status === "aborted";
var isDirty3 = (x) => x.status === "dirty";
var isValid3 = (x) => x.status === "valid";
var isAsync3 = (x) => typeof Promise !== "undefined" && x instanceof Promise;
var errorUtil3;
(function(errorUtil22) {
  errorUtil22.errToObj = (message) => typeof message === "string" ? { message } : message || {};
  errorUtil22.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil3 || (errorUtil3 = {}));
var ParseInputLazyPath3 = class {
  constructor(parent, value, path, key) {
    this._cachedPath = [];
    this.parent = parent;
    this.data = value;
    this._path = path;
    this._key = key;
  }
  get path() {
    if (!this._cachedPath.length) {
      if (Array.isArray(this._key)) {
        this._cachedPath.push(...this._path, ...this._key);
      } else {
        this._cachedPath.push(...this._path, this._key);
      }
    }
    return this._cachedPath;
  }
};
var handleResult3 = (ctx, result) => {
  if (isValid3(result)) {
    return { success: true, data: result.value };
  } else {
    if (!ctx.common.issues.length) {
      throw new Error("Validation failed but no issues detected.");
    }
    return {
      success: false,
      get error() {
        if (this._error)
          return this._error;
        const error = new ZodError3(ctx.common.issues);
        this._error = error;
        return this._error;
      }
    };
  }
};
function processCreateParams3(params) {
  if (!params)
    return {};
  const { errorMap: errorMap22, invalid_type_error, required_error, description } = params;
  if (errorMap22 && (invalid_type_error || required_error)) {
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  }
  if (errorMap22)
    return { errorMap: errorMap22, description };
  const customMap = (iss, ctx) => {
    const { message } = params;
    if (iss.code === "invalid_enum_value") {
      return { message: message ?? ctx.defaultError };
    }
    if (typeof ctx.data === "undefined") {
      return { message: message ?? required_error ?? ctx.defaultError };
    }
    if (iss.code !== "invalid_type")
      return { message: ctx.defaultError };
    return { message: message ?? invalid_type_error ?? ctx.defaultError };
  };
  return { errorMap: customMap, description };
}
var ZodType3 = class {
  get description() {
    return this._def.description;
  }
  _getType(input) {
    return getParsedType3(input.data);
  }
  _getOrReturnCtx(input, ctx) {
    return ctx || {
      common: input.parent.common,
      data: input.data,
      parsedType: getParsedType3(input.data),
      schemaErrorMap: this._def.errorMap,
      path: input.path,
      parent: input.parent
    };
  }
  _processInputParams(input) {
    return {
      status: new ParseStatus3(),
      ctx: {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType3(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      }
    };
  }
  _parseSync(input) {
    const result = this._parse(input);
    if (isAsync3(result)) {
      throw new Error("Synchronous parse encountered promise.");
    }
    return result;
  }
  _parseAsync(input) {
    const result = this._parse(input);
    return Promise.resolve(result);
  }
  parse(data, params) {
    const result = this.safeParse(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  safeParse(data, params) {
    const ctx = {
      common: {
        issues: [],
        async: params?.async ?? false,
        contextualErrorMap: params?.errorMap
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType3(data)
    };
    const result = this._parseSync({ data, path: ctx.path, parent: ctx });
    return handleResult3(ctx, result);
  }
  "~validate"(data) {
    const ctx = {
      common: {
        issues: [],
        async: !!this["~standard"].async
      },
      path: [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType3(data)
    };
    if (!this["~standard"].async) {
      try {
        const result = this._parseSync({ data, path: [], parent: ctx });
        return isValid3(result) ? {
          value: result.value
        } : {
          issues: ctx.common.issues
        };
      } catch (err) {
        if (err?.message?.toLowerCase()?.includes("encountered")) {
          this["~standard"].async = true;
        }
        ctx.common = {
          issues: [],
          async: true
        };
      }
    }
    return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid3(result) ? {
      value: result.value
    } : {
      issues: ctx.common.issues
    });
  }
  async parseAsync(data, params) {
    const result = await this.safeParseAsync(data, params);
    if (result.success)
      return result.data;
    throw result.error;
  }
  async safeParseAsync(data, params) {
    const ctx = {
      common: {
        issues: [],
        contextualErrorMap: params?.errorMap,
        async: true
      },
      path: params?.path || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data,
      parsedType: getParsedType3(data)
    };
    const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
    const result = await (isAsync3(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
    return handleResult3(ctx, result);
  }
  refine(check, message) {
    const getIssueProperties = (val) => {
      if (typeof message === "string" || typeof message === "undefined") {
        return { message };
      } else if (typeof message === "function") {
        return message(val);
      } else {
        return message;
      }
    };
    return this._refinement((val, ctx) => {
      const result = check(val);
      const setError = () => ctx.addIssue({
        code: ZodIssueCode3.custom,
        ...getIssueProperties(val)
      });
      if (typeof Promise !== "undefined" && result instanceof Promise) {
        return result.then((data) => {
          if (!data) {
            setError();
            return false;
          } else {
            return true;
          }
        });
      }
      if (!result) {
        setError();
        return false;
      } else {
        return true;
      }
    });
  }
  refinement(check, refinementData) {
    return this._refinement((val, ctx) => {
      if (!check(val)) {
        ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
        return false;
      } else {
        return true;
      }
    });
  }
  _refinement(refinement) {
    return new ZodEffects3({
      schema: this,
      typeName: ZodFirstPartyTypeKind3.ZodEffects,
      effect: { type: "refinement", refinement }
    });
  }
  superRefine(refinement) {
    return this._refinement(refinement);
  }
  constructor(def) {
    this.spa = this.safeParseAsync;
    this._def = def;
    this.parse = this.parse.bind(this);
    this.safeParse = this.safeParse.bind(this);
    this.parseAsync = this.parseAsync.bind(this);
    this.safeParseAsync = this.safeParseAsync.bind(this);
    this.spa = this.spa.bind(this);
    this.refine = this.refine.bind(this);
    this.refinement = this.refinement.bind(this);
    this.superRefine = this.superRefine.bind(this);
    this.optional = this.optional.bind(this);
    this.nullable = this.nullable.bind(this);
    this.nullish = this.nullish.bind(this);
    this.array = this.array.bind(this);
    this.promise = this.promise.bind(this);
    this.or = this.or.bind(this);
    this.and = this.and.bind(this);
    this.transform = this.transform.bind(this);
    this.brand = this.brand.bind(this);
    this.default = this.default.bind(this);
    this.catch = this.catch.bind(this);
    this.describe = this.describe.bind(this);
    this.pipe = this.pipe.bind(this);
    this.readonly = this.readonly.bind(this);
    this.isNullable = this.isNullable.bind(this);
    this.isOptional = this.isOptional.bind(this);
    this["~standard"] = {
      version: 1,
      vendor: "zod",
      validate: (data) => this["~validate"](data)
    };
  }
  optional() {
    return ZodOptional3.create(this, this._def);
  }
  nullable() {
    return ZodNullable3.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return ZodArray3.create(this);
  }
  promise() {
    return ZodPromise3.create(this, this._def);
  }
  or(option) {
    return ZodUnion3.create([this, option], this._def);
  }
  and(incoming) {
    return ZodIntersection3.create(this, incoming, this._def);
  }
  transform(transform) {
    return new ZodEffects3({
      ...processCreateParams3(this._def),
      schema: this,
      typeName: ZodFirstPartyTypeKind3.ZodEffects,
      effect: { type: "transform", transform }
    });
  }
  default(def) {
    const defaultValueFunc = typeof def === "function" ? def : () => def;
    return new ZodDefault3({
      ...processCreateParams3(this._def),
      innerType: this,
      defaultValue: defaultValueFunc,
      typeName: ZodFirstPartyTypeKind3.ZodDefault
    });
  }
  brand() {
    return new ZodBranded3({
      typeName: ZodFirstPartyTypeKind3.ZodBranded,
      type: this,
      ...processCreateParams3(this._def)
    });
  }
  catch(def) {
    const catchValueFunc = typeof def === "function" ? def : () => def;
    return new ZodCatch3({
      ...processCreateParams3(this._def),
      innerType: this,
      catchValue: catchValueFunc,
      typeName: ZodFirstPartyTypeKind3.ZodCatch
    });
  }
  describe(description) {
    const This = this.constructor;
    return new This({
      ...this._def,
      description
    });
  }
  pipe(target) {
    return ZodPipeline3.create(this, target);
  }
  readonly() {
    return ZodReadonly3.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
};
var cuidRegex3 = /^c[^\s-]{8,}$/i;
var cuid2Regex3 = /^[0-9a-z]+$/;
var ulidRegex3 = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex3 = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex3 = /^[a-z0-9_-]{21}$/i;
var jwtRegex3 = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex3 = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex3 = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex3 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex3;
var ipv4Regex3 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex3 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex3 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex3 = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex3 = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex3 = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource3 = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex3 = new RegExp(`^${dateRegexSource3}$`);
function timeRegexSource3(args) {
  let secondsRegexSource = `[0-5]\\d`;
  if (args.precision) {
    secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
  } else if (args.precision == null) {
    secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
  }
  const secondsQuantifier = args.precision ? "+" : "?";
  return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex3(args) {
  return new RegExp(`^${timeRegexSource3(args)}$`);
}
function datetimeRegex3(args) {
  let regex = `${dateRegexSource3}T${timeRegexSource3(args)}`;
  const opts = [];
  opts.push(args.local ? `Z?` : `Z`);
  if (args.offset)
    opts.push(`([+-]\\d{2}:?\\d{2})`);
  regex = `${regex}(${opts.join("|")})`;
  return new RegExp(`^${regex}$`);
}
function isValidIP3(ip, version) {
  if ((version === "v4" || !version) && ipv4Regex3.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6Regex3.test(ip)) {
    return true;
  }
  return false;
}
function isValidJWT3(jwt, alg) {
  if (!jwtRegex3.test(jwt))
    return false;
  try {
    const [header] = jwt.split(".");
    if (!header)
      return false;
    const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
    const decoded = JSON.parse(atob(base64));
    if (typeof decoded !== "object" || decoded === null)
      return false;
    if ("typ" in decoded && decoded?.typ !== "JWT")
      return false;
    if (!decoded.alg)
      return false;
    if (alg && decoded.alg !== alg)
      return false;
    return true;
  } catch {
    return false;
  }
}
function isValidCidr3(ip, version) {
  if ((version === "v4" || !version) && ipv4CidrRegex3.test(ip)) {
    return true;
  }
  if ((version === "v6" || !version) && ipv6CidrRegex3.test(ip)) {
    return true;
  }
  return false;
}
var ZodString3 = class _ZodString2 extends ZodType3 {
  _parse(input) {
    if (this._def.coerce) {
      input.data = String(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.string) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext3(ctx2, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.string,
        received: ctx2.parsedType
      });
      return INVALID3;
    }
    const status = new ParseStatus3();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.length < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_small,
            minimum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.length > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_big,
            maximum: check.value,
            type: "string",
            inclusive: true,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "length") {
        const tooBig = input.data.length > check.value;
        const tooSmall = input.data.length < check.value;
        if (tooBig || tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          if (tooBig) {
            addIssueToContext3(ctx, {
              code: ZodIssueCode3.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          } else if (tooSmall) {
            addIssueToContext3(ctx, {
              code: ZodIssueCode3.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: true,
              message: check.message
            });
          }
          status.dirty();
        }
      } else if (check.kind === "email") {
        if (!emailRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "email",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "emoji") {
        if (!emojiRegex3) {
          emojiRegex3 = new RegExp(_emojiRegex3, "u");
        }
        if (!emojiRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "emoji",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "uuid") {
        if (!uuidRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "uuid",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "nanoid") {
        if (!nanoidRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "nanoid",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid") {
        if (!cuidRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "cuid",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cuid2") {
        if (!cuid2Regex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "cuid2",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ulid") {
        if (!ulidRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "ulid",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "url") {
        try {
          new URL(input.data);
        } catch {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "url",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "regex") {
        check.regex.lastIndex = 0;
        const testResult = check.regex.test(input.data);
        if (!testResult) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "regex",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "trim") {
        input.data = input.data.trim();
      } else if (check.kind === "includes") {
        if (!input.data.includes(check.value, check.position)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_string,
            validation: { includes: check.value, position: check.position },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "toLowerCase") {
        input.data = input.data.toLowerCase();
      } else if (check.kind === "toUpperCase") {
        input.data = input.data.toUpperCase();
      } else if (check.kind === "startsWith") {
        if (!input.data.startsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_string,
            validation: { startsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "endsWith") {
        if (!input.data.endsWith(check.value)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_string,
            validation: { endsWith: check.value },
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "datetime") {
        const regex = datetimeRegex3(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_string,
            validation: "datetime",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "date") {
        const regex = dateRegex3;
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_string,
            validation: "date",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "time") {
        const regex = timeRegex3(check);
        if (!regex.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_string,
            validation: "time",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "duration") {
        if (!durationRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "duration",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "ip") {
        if (!isValidIP3(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "ip",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "jwt") {
        if (!isValidJWT3(input.data, check.alg)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "jwt",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "cidr") {
        if (!isValidCidr3(input.data, check.version)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "cidr",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64") {
        if (!base64Regex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "base64",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "base64url") {
        if (!base64urlRegex3.test(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            validation: "base64url",
            code: ZodIssueCode3.invalid_string,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util3.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _regex(regex, validation, message) {
    return this.refinement((data) => regex.test(data), {
      validation,
      code: ZodIssueCode3.invalid_string,
      ...errorUtil3.errToObj(message)
    });
  }
  _addCheck(check) {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  email(message) {
    return this._addCheck({ kind: "email", ...errorUtil3.errToObj(message) });
  }
  url(message) {
    return this._addCheck({ kind: "url", ...errorUtil3.errToObj(message) });
  }
  emoji(message) {
    return this._addCheck({ kind: "emoji", ...errorUtil3.errToObj(message) });
  }
  uuid(message) {
    return this._addCheck({ kind: "uuid", ...errorUtil3.errToObj(message) });
  }
  nanoid(message) {
    return this._addCheck({ kind: "nanoid", ...errorUtil3.errToObj(message) });
  }
  cuid(message) {
    return this._addCheck({ kind: "cuid", ...errorUtil3.errToObj(message) });
  }
  cuid2(message) {
    return this._addCheck({ kind: "cuid2", ...errorUtil3.errToObj(message) });
  }
  ulid(message) {
    return this._addCheck({ kind: "ulid", ...errorUtil3.errToObj(message) });
  }
  base64(message) {
    return this._addCheck({ kind: "base64", ...errorUtil3.errToObj(message) });
  }
  base64url(message) {
    return this._addCheck({
      kind: "base64url",
      ...errorUtil3.errToObj(message)
    });
  }
  jwt(options) {
    return this._addCheck({ kind: "jwt", ...errorUtil3.errToObj(options) });
  }
  ip(options) {
    return this._addCheck({ kind: "ip", ...errorUtil3.errToObj(options) });
  }
  cidr(options) {
    return this._addCheck({ kind: "cidr", ...errorUtil3.errToObj(options) });
  }
  datetime(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "datetime",
        precision: null,
        offset: false,
        local: false,
        message: options
      });
    }
    return this._addCheck({
      kind: "datetime",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      offset: options?.offset ?? false,
      local: options?.local ?? false,
      ...errorUtil3.errToObj(options?.message)
    });
  }
  date(message) {
    return this._addCheck({ kind: "date", message });
  }
  time(options) {
    if (typeof options === "string") {
      return this._addCheck({
        kind: "time",
        precision: null,
        message: options
      });
    }
    return this._addCheck({
      kind: "time",
      precision: typeof options?.precision === "undefined" ? null : options?.precision,
      ...errorUtil3.errToObj(options?.message)
    });
  }
  duration(message) {
    return this._addCheck({ kind: "duration", ...errorUtil3.errToObj(message) });
  }
  regex(regex, message) {
    return this._addCheck({
      kind: "regex",
      regex,
      ...errorUtil3.errToObj(message)
    });
  }
  includes(value, options) {
    return this._addCheck({
      kind: "includes",
      value,
      position: options?.position,
      ...errorUtil3.errToObj(options?.message)
    });
  }
  startsWith(value, message) {
    return this._addCheck({
      kind: "startsWith",
      value,
      ...errorUtil3.errToObj(message)
    });
  }
  endsWith(value, message) {
    return this._addCheck({
      kind: "endsWith",
      value,
      ...errorUtil3.errToObj(message)
    });
  }
  min(minLength, message) {
    return this._addCheck({
      kind: "min",
      value: minLength,
      ...errorUtil3.errToObj(message)
    });
  }
  max(maxLength, message) {
    return this._addCheck({
      kind: "max",
      value: maxLength,
      ...errorUtil3.errToObj(message)
    });
  }
  length(len, message) {
    return this._addCheck({
      kind: "length",
      value: len,
      ...errorUtil3.errToObj(message)
    });
  }
  /**
   * Equivalent to `.min(1)`
   */
  nonempty(message) {
    return this.min(1, errorUtil3.errToObj(message));
  }
  trim() {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new _ZodString2({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((ch) => ch.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((ch) => ch.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((ch) => ch.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((ch) => ch.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((ch) => ch.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((ch) => ch.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((ch) => ch.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((ch) => ch.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((ch) => ch.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((ch) => ch.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((ch) => ch.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((ch) => ch.kind === "ip");
  }
  get isCIDR() {
    return !!this._def.checks.find((ch) => ch.kind === "cidr");
  }
  get isBase64() {
    return !!this._def.checks.find((ch) => ch.kind === "base64");
  }
  get isBase64url() {
    return !!this._def.checks.find((ch) => ch.kind === "base64url");
  }
  get minLength() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxLength() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodString3.create = (params) => {
  return new ZodString3({
    checks: [],
    typeName: ZodFirstPartyTypeKind3.ZodString,
    coerce: params?.coerce ?? false,
    ...processCreateParams3(params)
  });
};
function floatSafeRemainder3(val, step) {
  const valDecCount = (val.toString().split(".")[1] || "").length;
  const stepDecCount = (step.toString().split(".")[1] || "").length;
  const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
  const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
  const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
  return valInt % stepInt / 10 ** decCount;
}
var ZodNumber3 = class _ZodNumber2 extends ZodType3 {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
    this.step = this.multipleOf;
  }
  _parse(input) {
    if (this._def.coerce) {
      input.data = Number(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.number) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext3(ctx2, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.number,
        received: ctx2.parsedType
      });
      return INVALID3;
    }
    let ctx = void 0;
    const status = new ParseStatus3();
    for (const check of this._def.checks) {
      if (check.kind === "int") {
        if (!util3.isInteger(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.invalid_type,
            expected: "integer",
            received: "float",
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_small,
            minimum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_big,
            maximum: check.value,
            type: "number",
            inclusive: check.inclusive,
            exact: false,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (floatSafeRemainder3(input.data, check.value) !== 0) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "finite") {
        if (!Number.isFinite(input.data)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.not_finite,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util3.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil3.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil3.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil3.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil3.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodNumber2({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil3.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodNumber2({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  int(message) {
    return this._addCheck({
      kind: "int",
      message: errorUtil3.toString(message)
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: false,
      message: errorUtil3.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: false,
      message: errorUtil3.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: true,
      message: errorUtil3.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: true,
      message: errorUtil3.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil3.toString(message)
    });
  }
  finite(message) {
    return this._addCheck({
      kind: "finite",
      message: errorUtil3.toString(message)
    });
  }
  safe(message) {
    return this._addCheck({
      kind: "min",
      inclusive: true,
      value: Number.MIN_SAFE_INTEGER,
      message: errorUtil3.toString(message)
    })._addCheck({
      kind: "max",
      inclusive: true,
      value: Number.MAX_SAFE_INTEGER,
      message: errorUtil3.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
  get isInt() {
    return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util3.isInteger(ch.value));
  }
  get isFinite() {
    let max = null;
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
        return true;
      } else if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      } else if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return Number.isFinite(min) && Number.isFinite(max);
  }
};
ZodNumber3.create = (params) => {
  return new ZodNumber3({
    checks: [],
    typeName: ZodFirstPartyTypeKind3.ZodNumber,
    coerce: params?.coerce || false,
    ...processCreateParams3(params)
  });
};
var ZodBigInt3 = class _ZodBigInt2 extends ZodType3 {
  constructor() {
    super(...arguments);
    this.min = this.gte;
    this.max = this.lte;
  }
  _parse(input) {
    if (this._def.coerce) {
      try {
        input.data = BigInt(input.data);
      } catch {
        return this._getInvalidInput(input);
      }
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.bigint) {
      return this._getInvalidInput(input);
    }
    let ctx = void 0;
    const status = new ParseStatus3();
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
        if (tooSmall) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_small,
            type: "bigint",
            minimum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
        if (tooBig) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_big,
            type: "bigint",
            maximum: check.value,
            inclusive: check.inclusive,
            message: check.message
          });
          status.dirty();
        }
      } else if (check.kind === "multipleOf") {
        if (input.data % check.value !== BigInt(0)) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.not_multiple_of,
            multipleOf: check.value,
            message: check.message
          });
          status.dirty();
        }
      } else {
        util3.assertNever(check);
      }
    }
    return { status: status.value, value: input.data };
  }
  _getInvalidInput(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext3(ctx, {
      code: ZodIssueCode3.invalid_type,
      expected: ZodParsedType3.bigint,
      received: ctx.parsedType
    });
    return INVALID3;
  }
  gte(value, message) {
    return this.setLimit("min", value, true, errorUtil3.toString(message));
  }
  gt(value, message) {
    return this.setLimit("min", value, false, errorUtil3.toString(message));
  }
  lte(value, message) {
    return this.setLimit("max", value, true, errorUtil3.toString(message));
  }
  lt(value, message) {
    return this.setLimit("max", value, false, errorUtil3.toString(message));
  }
  setLimit(kind, value, inclusive, message) {
    return new _ZodBigInt2({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind,
          value,
          inclusive,
          message: errorUtil3.toString(message)
        }
      ]
    });
  }
  _addCheck(check) {
    return new _ZodBigInt2({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  positive(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil3.toString(message)
    });
  }
  negative(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: false,
      message: errorUtil3.toString(message)
    });
  }
  nonpositive(message) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil3.toString(message)
    });
  }
  nonnegative(message) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: true,
      message: errorUtil3.toString(message)
    });
  }
  multipleOf(value, message) {
    return this._addCheck({
      kind: "multipleOf",
      value,
      message: errorUtil3.toString(message)
    });
  }
  get minValue() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min;
  }
  get maxValue() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max;
  }
};
ZodBigInt3.create = (params) => {
  return new ZodBigInt3({
    checks: [],
    typeName: ZodFirstPartyTypeKind3.ZodBigInt,
    coerce: params?.coerce ?? false,
    ...processCreateParams3(params)
  });
};
var ZodBoolean3 = class extends ZodType3 {
  _parse(input) {
    if (this._def.coerce) {
      input.data = Boolean(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.boolean) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.boolean,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
};
ZodBoolean3.create = (params) => {
  return new ZodBoolean3({
    typeName: ZodFirstPartyTypeKind3.ZodBoolean,
    coerce: params?.coerce || false,
    ...processCreateParams3(params)
  });
};
var ZodDate3 = class _ZodDate2 extends ZodType3 {
  _parse(input) {
    if (this._def.coerce) {
      input.data = new Date(input.data);
    }
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.date) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext3(ctx2, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.date,
        received: ctx2.parsedType
      });
      return INVALID3;
    }
    if (Number.isNaN(input.data.getTime())) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext3(ctx2, {
        code: ZodIssueCode3.invalid_date
      });
      return INVALID3;
    }
    const status = new ParseStatus3();
    let ctx = void 0;
    for (const check of this._def.checks) {
      if (check.kind === "min") {
        if (input.data.getTime() < check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_small,
            message: check.message,
            inclusive: true,
            exact: false,
            minimum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else if (check.kind === "max") {
        if (input.data.getTime() > check.value) {
          ctx = this._getOrReturnCtx(input, ctx);
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.too_big,
            message: check.message,
            inclusive: true,
            exact: false,
            maximum: check.value,
            type: "date"
          });
          status.dirty();
        }
      } else {
        util3.assertNever(check);
      }
    }
    return {
      status: status.value,
      value: new Date(input.data.getTime())
    };
  }
  _addCheck(check) {
    return new _ZodDate2({
      ...this._def,
      checks: [...this._def.checks, check]
    });
  }
  min(minDate, message) {
    return this._addCheck({
      kind: "min",
      value: minDate.getTime(),
      message: errorUtil3.toString(message)
    });
  }
  max(maxDate, message) {
    return this._addCheck({
      kind: "max",
      value: maxDate.getTime(),
      message: errorUtil3.toString(message)
    });
  }
  get minDate() {
    let min = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "min") {
        if (min === null || ch.value > min)
          min = ch.value;
      }
    }
    return min != null ? new Date(min) : null;
  }
  get maxDate() {
    let max = null;
    for (const ch of this._def.checks) {
      if (ch.kind === "max") {
        if (max === null || ch.value < max)
          max = ch.value;
      }
    }
    return max != null ? new Date(max) : null;
  }
};
ZodDate3.create = (params) => {
  return new ZodDate3({
    checks: [],
    coerce: params?.coerce || false,
    typeName: ZodFirstPartyTypeKind3.ZodDate,
    ...processCreateParams3(params)
  });
};
var ZodSymbol3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.symbol) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.symbol,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
};
ZodSymbol3.create = (params) => {
  return new ZodSymbol3({
    typeName: ZodFirstPartyTypeKind3.ZodSymbol,
    ...processCreateParams3(params)
  });
};
var ZodUndefined3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.undefined,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
};
ZodUndefined3.create = (params) => {
  return new ZodUndefined3({
    typeName: ZodFirstPartyTypeKind3.ZodUndefined,
    ...processCreateParams3(params)
  });
};
var ZodNull3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.null) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.null,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
};
ZodNull3.create = (params) => {
  return new ZodNull3({
    typeName: ZodFirstPartyTypeKind3.ZodNull,
    ...processCreateParams3(params)
  });
};
var ZodAny3 = class extends ZodType3 {
  constructor() {
    super(...arguments);
    this._any = true;
  }
  _parse(input) {
    return OK3(input.data);
  }
};
ZodAny3.create = (params) => {
  return new ZodAny3({
    typeName: ZodFirstPartyTypeKind3.ZodAny,
    ...processCreateParams3(params)
  });
};
var ZodUnknown3 = class extends ZodType3 {
  constructor() {
    super(...arguments);
    this._unknown = true;
  }
  _parse(input) {
    return OK3(input.data);
  }
};
ZodUnknown3.create = (params) => {
  return new ZodUnknown3({
    typeName: ZodFirstPartyTypeKind3.ZodUnknown,
    ...processCreateParams3(params)
  });
};
var ZodNever3 = class extends ZodType3 {
  _parse(input) {
    const ctx = this._getOrReturnCtx(input);
    addIssueToContext3(ctx, {
      code: ZodIssueCode3.invalid_type,
      expected: ZodParsedType3.never,
      received: ctx.parsedType
    });
    return INVALID3;
  }
};
ZodNever3.create = (params) => {
  return new ZodNever3({
    typeName: ZodFirstPartyTypeKind3.ZodNever,
    ...processCreateParams3(params)
  });
};
var ZodVoid3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.undefined) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.void,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
};
ZodVoid3.create = (params) => {
  return new ZodVoid3({
    typeName: ZodFirstPartyTypeKind3.ZodVoid,
    ...processCreateParams3(params)
  });
};
var ZodArray3 = class _ZodArray2 extends ZodType3 {
  _parse(input) {
    const { ctx, status } = this._processInputParams(input);
    const def = this._def;
    if (ctx.parsedType !== ZodParsedType3.array) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.array,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    if (def.exactLength !== null) {
      const tooBig = ctx.data.length > def.exactLength.value;
      const tooSmall = ctx.data.length < def.exactLength.value;
      if (tooBig || tooSmall) {
        addIssueToContext3(ctx, {
          code: tooBig ? ZodIssueCode3.too_big : ZodIssueCode3.too_small,
          minimum: tooSmall ? def.exactLength.value : void 0,
          maximum: tooBig ? def.exactLength.value : void 0,
          type: "array",
          inclusive: true,
          exact: true,
          message: def.exactLength.message
        });
        status.dirty();
      }
    }
    if (def.minLength !== null) {
      if (ctx.data.length < def.minLength.value) {
        addIssueToContext3(ctx, {
          code: ZodIssueCode3.too_small,
          minimum: def.minLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.minLength.message
        });
        status.dirty();
      }
    }
    if (def.maxLength !== null) {
      if (ctx.data.length > def.maxLength.value) {
        addIssueToContext3(ctx, {
          code: ZodIssueCode3.too_big,
          maximum: def.maxLength.value,
          type: "array",
          inclusive: true,
          exact: false,
          message: def.maxLength.message
        });
        status.dirty();
      }
    }
    if (ctx.common.async) {
      return Promise.all([...ctx.data].map((item, i) => {
        return def.type._parseAsync(new ParseInputLazyPath3(ctx, item, ctx.path, i));
      })).then((result2) => {
        return ParseStatus3.mergeArray(status, result2);
      });
    }
    const result = [...ctx.data].map((item, i) => {
      return def.type._parseSync(new ParseInputLazyPath3(ctx, item, ctx.path, i));
    });
    return ParseStatus3.mergeArray(status, result);
  }
  get element() {
    return this._def.type;
  }
  min(minLength, message) {
    return new _ZodArray2({
      ...this._def,
      minLength: { value: minLength, message: errorUtil3.toString(message) }
    });
  }
  max(maxLength, message) {
    return new _ZodArray2({
      ...this._def,
      maxLength: { value: maxLength, message: errorUtil3.toString(message) }
    });
  }
  length(len, message) {
    return new _ZodArray2({
      ...this._def,
      exactLength: { value: len, message: errorUtil3.toString(message) }
    });
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodArray3.create = (schema, params) => {
  return new ZodArray3({
    type: schema,
    minLength: null,
    maxLength: null,
    exactLength: null,
    typeName: ZodFirstPartyTypeKind3.ZodArray,
    ...processCreateParams3(params)
  });
};
function deepPartialify3(schema) {
  if (schema instanceof ZodObject3) {
    const newShape = {};
    for (const key in schema.shape) {
      const fieldSchema = schema.shape[key];
      newShape[key] = ZodOptional3.create(deepPartialify3(fieldSchema));
    }
    return new ZodObject3({
      ...schema._def,
      shape: () => newShape
    });
  } else if (schema instanceof ZodArray3) {
    return new ZodArray3({
      ...schema._def,
      type: deepPartialify3(schema.element)
    });
  } else if (schema instanceof ZodOptional3) {
    return ZodOptional3.create(deepPartialify3(schema.unwrap()));
  } else if (schema instanceof ZodNullable3) {
    return ZodNullable3.create(deepPartialify3(schema.unwrap()));
  } else if (schema instanceof ZodTuple3) {
    return ZodTuple3.create(schema.items.map((item) => deepPartialify3(item)));
  } else {
    return schema;
  }
}
var ZodObject3 = class _ZodObject2 extends ZodType3 {
  constructor() {
    super(...arguments);
    this._cached = null;
    this.nonstrict = this.passthrough;
    this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const shape = this._def.shape();
    const keys = util3.objectKeys(shape);
    this._cached = { shape, keys };
    return this._cached;
  }
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.object) {
      const ctx2 = this._getOrReturnCtx(input);
      addIssueToContext3(ctx2, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.object,
        received: ctx2.parsedType
      });
      return INVALID3;
    }
    const { status, ctx } = this._processInputParams(input);
    const { shape, keys: shapeKeys } = this._getCached();
    const extraKeys = [];
    if (!(this._def.catchall instanceof ZodNever3 && this._def.unknownKeys === "strip")) {
      for (const key in ctx.data) {
        if (!shapeKeys.includes(key)) {
          extraKeys.push(key);
        }
      }
    }
    const pairs = [];
    for (const key of shapeKeys) {
      const keyValidator = shape[key];
      const value = ctx.data[key];
      pairs.push({
        key: { status: "valid", value: key },
        value: keyValidator._parse(new ParseInputLazyPath3(ctx, value, ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (this._def.catchall instanceof ZodNever3) {
      const unknownKeys = this._def.unknownKeys;
      if (unknownKeys === "passthrough") {
        for (const key of extraKeys) {
          pairs.push({
            key: { status: "valid", value: key },
            value: { status: "valid", value: ctx.data[key] }
          });
        }
      } else if (unknownKeys === "strict") {
        if (extraKeys.length > 0) {
          addIssueToContext3(ctx, {
            code: ZodIssueCode3.unrecognized_keys,
            keys: extraKeys
          });
          status.dirty();
        }
      } else if (unknownKeys === "strip") {
      } else {
        throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
      }
    } else {
      const catchall = this._def.catchall;
      for (const key of extraKeys) {
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: catchall._parse(
            new ParseInputLazyPath3(ctx, value, ctx.path, key)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: key in ctx.data
        });
      }
    }
    if (ctx.common.async) {
      return Promise.resolve().then(async () => {
        const syncPairs = [];
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          syncPairs.push({
            key,
            value,
            alwaysSet: pair.alwaysSet
          });
        }
        return syncPairs;
      }).then((syncPairs) => {
        return ParseStatus3.mergeObjectSync(status, syncPairs);
      });
    } else {
      return ParseStatus3.mergeObjectSync(status, pairs);
    }
  }
  get shape() {
    return this._def.shape();
  }
  strict(message) {
    errorUtil3.errToObj;
    return new _ZodObject2({
      ...this._def,
      unknownKeys: "strict",
      ...message !== void 0 ? {
        errorMap: (issue, ctx) => {
          const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
          if (issue.code === "unrecognized_keys")
            return {
              message: errorUtil3.errToObj(message).message ?? defaultError
            };
          return {
            message: defaultError
          };
        }
      } : {}
    });
  }
  strip() {
    return new _ZodObject2({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new _ZodObject2({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(augmentation) {
    return new _ZodObject2({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...augmentation
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(merging) {
    const merged = new _ZodObject2({
      unknownKeys: merging._def.unknownKeys,
      catchall: merging._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...merging._def.shape()
      }),
      typeName: ZodFirstPartyTypeKind3.ZodObject
    });
    return merged;
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(key, schema) {
    return this.augment({ [key]: schema });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(index) {
    return new _ZodObject2({
      ...this._def,
      catchall: index
    });
  }
  pick(mask) {
    const shape = {};
    for (const key of util3.objectKeys(mask)) {
      if (mask[key] && this.shape[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject2({
      ...this._def,
      shape: () => shape
    });
  }
  omit(mask) {
    const shape = {};
    for (const key of util3.objectKeys(this.shape)) {
      if (!mask[key]) {
        shape[key] = this.shape[key];
      }
    }
    return new _ZodObject2({
      ...this._def,
      shape: () => shape
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return deepPartialify3(this);
  }
  partial(mask) {
    const newShape = {};
    for (const key of util3.objectKeys(this.shape)) {
      const fieldSchema = this.shape[key];
      if (mask && !mask[key]) {
        newShape[key] = fieldSchema;
      } else {
        newShape[key] = fieldSchema.optional();
      }
    }
    return new _ZodObject2({
      ...this._def,
      shape: () => newShape
    });
  }
  required(mask) {
    const newShape = {};
    for (const key of util3.objectKeys(this.shape)) {
      if (mask && !mask[key]) {
        newShape[key] = this.shape[key];
      } else {
        const fieldSchema = this.shape[key];
        let newField = fieldSchema;
        while (newField instanceof ZodOptional3) {
          newField = newField._def.innerType;
        }
        newShape[key] = newField;
      }
    }
    return new _ZodObject2({
      ...this._def,
      shape: () => newShape
    });
  }
  keyof() {
    return createZodEnum3(util3.objectKeys(this.shape));
  }
};
ZodObject3.create = (shape, params) => {
  return new ZodObject3({
    shape: () => shape,
    unknownKeys: "strip",
    catchall: ZodNever3.create(),
    typeName: ZodFirstPartyTypeKind3.ZodObject,
    ...processCreateParams3(params)
  });
};
ZodObject3.strictCreate = (shape, params) => {
  return new ZodObject3({
    shape: () => shape,
    unknownKeys: "strict",
    catchall: ZodNever3.create(),
    typeName: ZodFirstPartyTypeKind3.ZodObject,
    ...processCreateParams3(params)
  });
};
ZodObject3.lazycreate = (shape, params) => {
  return new ZodObject3({
    shape,
    unknownKeys: "strip",
    catchall: ZodNever3.create(),
    typeName: ZodFirstPartyTypeKind3.ZodObject,
    ...processCreateParams3(params)
  });
};
var ZodUnion3 = class extends ZodType3 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const options = this._def.options;
    function handleResults(results) {
      for (const result of results) {
        if (result.result.status === "valid") {
          return result.result;
        }
      }
      for (const result of results) {
        if (result.result.status === "dirty") {
          ctx.common.issues.push(...result.ctx.common.issues);
          return result.result;
        }
      }
      const unionErrors = results.map((result) => new ZodError3(result.ctx.common.issues));
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_union,
        unionErrors
      });
      return INVALID3;
    }
    if (ctx.common.async) {
      return Promise.all(options.map(async (option) => {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await option._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          }),
          ctx: childCtx
        };
      })).then(handleResults);
    } else {
      let dirty = void 0;
      const issues = [];
      for (const option of options) {
        const childCtx = {
          ...ctx,
          common: {
            ...ctx.common,
            issues: []
          },
          parent: null
        };
        const result = option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: childCtx
        });
        if (result.status === "valid") {
          return result;
        } else if (result.status === "dirty" && !dirty) {
          dirty = { result, ctx: childCtx };
        }
        if (childCtx.common.issues.length) {
          issues.push(childCtx.common.issues);
        }
      }
      if (dirty) {
        ctx.common.issues.push(...dirty.ctx.common.issues);
        return dirty.result;
      }
      const unionErrors = issues.map((issues2) => new ZodError3(issues2));
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_union,
        unionErrors
      });
      return INVALID3;
    }
  }
  get options() {
    return this._def.options;
  }
};
ZodUnion3.create = (types, params) => {
  return new ZodUnion3({
    options: types,
    typeName: ZodFirstPartyTypeKind3.ZodUnion,
    ...processCreateParams3(params)
  });
};
var getDiscriminator3 = (type) => {
  if (type instanceof ZodLazy3) {
    return getDiscriminator3(type.schema);
  } else if (type instanceof ZodEffects3) {
    return getDiscriminator3(type.innerType());
  } else if (type instanceof ZodLiteral3) {
    return [type.value];
  } else if (type instanceof ZodEnum3) {
    return type.options;
  } else if (type instanceof ZodNativeEnum3) {
    return util3.objectValues(type.enum);
  } else if (type instanceof ZodDefault3) {
    return getDiscriminator3(type._def.innerType);
  } else if (type instanceof ZodUndefined3) {
    return [void 0];
  } else if (type instanceof ZodNull3) {
    return [null];
  } else if (type instanceof ZodOptional3) {
    return [void 0, ...getDiscriminator3(type.unwrap())];
  } else if (type instanceof ZodNullable3) {
    return [null, ...getDiscriminator3(type.unwrap())];
  } else if (type instanceof ZodBranded3) {
    return getDiscriminator3(type.unwrap());
  } else if (type instanceof ZodReadonly3) {
    return getDiscriminator3(type.unwrap());
  } else if (type instanceof ZodCatch3) {
    return getDiscriminator3(type._def.innerType);
  } else {
    return [];
  }
};
var ZodDiscriminatedUnion3 = class _ZodDiscriminatedUnion2 extends ZodType3 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.object) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.object,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    const discriminator = this.discriminator;
    const discriminatorValue = ctx.data[discriminator];
    const option = this.optionsMap.get(discriminatorValue);
    if (!option) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_union_discriminator,
        options: Array.from(this.optionsMap.keys()),
        path: [discriminator]
      });
      return INVALID3;
    }
    if (ctx.common.async) {
      return option._parseAsync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    } else {
      return option._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
    }
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(discriminator, options, params) {
    const optionsMap = /* @__PURE__ */ new Map();
    for (const type of options) {
      const discriminatorValues = getDiscriminator3(type.shape[discriminator]);
      if (!discriminatorValues.length) {
        throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
      }
      for (const value of discriminatorValues) {
        if (optionsMap.has(value)) {
          throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
        }
        optionsMap.set(value, type);
      }
    }
    return new _ZodDiscriminatedUnion2({
      typeName: ZodFirstPartyTypeKind3.ZodDiscriminatedUnion,
      discriminator,
      options,
      optionsMap,
      ...processCreateParams3(params)
    });
  }
};
function mergeValues3(a, b) {
  const aType = getParsedType3(a);
  const bType = getParsedType3(b);
  if (a === b) {
    return { valid: true, data: a };
  } else if (aType === ZodParsedType3.object && bType === ZodParsedType3.object) {
    const bKeys = util3.objectKeys(b);
    const sharedKeys = util3.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues3(a[key], b[key]);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  } else if (aType === ZodParsedType3.array && bType === ZodParsedType3.array) {
    if (a.length !== b.length) {
      return { valid: false };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues3(itemA, itemB);
      if (!sharedValue.valid) {
        return { valid: false };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  } else if (aType === ZodParsedType3.date && bType === ZodParsedType3.date && +a === +b) {
    return { valid: true, data: a };
  } else {
    return { valid: false };
  }
}
var ZodIntersection3 = class extends ZodType3 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const handleParsed = (parsedLeft, parsedRight) => {
      if (isAborted3(parsedLeft) || isAborted3(parsedRight)) {
        return INVALID3;
      }
      const merged = mergeValues3(parsedLeft.value, parsedRight.value);
      if (!merged.valid) {
        addIssueToContext3(ctx, {
          code: ZodIssueCode3.invalid_intersection_types
        });
        return INVALID3;
      }
      if (isDirty3(parsedLeft) || isDirty3(parsedRight)) {
        status.dirty();
      }
      return { status: status.value, value: merged.data };
    };
    if (ctx.common.async) {
      return Promise.all([
        this._def.left._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }),
        this._def.right._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        })
      ]).then(([left, right]) => handleParsed(left, right));
    } else {
      return handleParsed(this._def.left._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }), this._def.right._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      }));
    }
  }
};
ZodIntersection3.create = (left, right, params) => {
  return new ZodIntersection3({
    left,
    right,
    typeName: ZodFirstPartyTypeKind3.ZodIntersection,
    ...processCreateParams3(params)
  });
};
var ZodTuple3 = class _ZodTuple2 extends ZodType3 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.array) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.array,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    if (ctx.data.length < this._def.items.length) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.too_small,
        minimum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      return INVALID3;
    }
    const rest = this._def.rest;
    if (!rest && ctx.data.length > this._def.items.length) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.too_big,
        maximum: this._def.items.length,
        inclusive: true,
        exact: false,
        type: "array"
      });
      status.dirty();
    }
    const items = [...ctx.data].map((item, itemIndex) => {
      const schema = this._def.items[itemIndex] || this._def.rest;
      if (!schema)
        return null;
      return schema._parse(new ParseInputLazyPath3(ctx, item, ctx.path, itemIndex));
    }).filter((x) => !!x);
    if (ctx.common.async) {
      return Promise.all(items).then((results) => {
        return ParseStatus3.mergeArray(status, results);
      });
    } else {
      return ParseStatus3.mergeArray(status, items);
    }
  }
  get items() {
    return this._def.items;
  }
  rest(rest) {
    return new _ZodTuple2({
      ...this._def,
      rest
    });
  }
};
ZodTuple3.create = (schemas, params) => {
  if (!Array.isArray(schemas)) {
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  }
  return new ZodTuple3({
    items: schemas,
    typeName: ZodFirstPartyTypeKind3.ZodTuple,
    rest: null,
    ...processCreateParams3(params)
  });
};
var ZodRecord3 = class _ZodRecord2 extends ZodType3 {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.object) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.object,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    const pairs = [];
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    for (const key in ctx.data) {
      pairs.push({
        key: keyType._parse(new ParseInputLazyPath3(ctx, key, ctx.path, key)),
        value: valueType._parse(new ParseInputLazyPath3(ctx, ctx.data[key], ctx.path, key)),
        alwaysSet: key in ctx.data
      });
    }
    if (ctx.common.async) {
      return ParseStatus3.mergeObjectAsync(status, pairs);
    } else {
      return ParseStatus3.mergeObjectSync(status, pairs);
    }
  }
  get element() {
    return this._def.valueType;
  }
  static create(first, second, third) {
    if (second instanceof ZodType3) {
      return new _ZodRecord2({
        keyType: first,
        valueType: second,
        typeName: ZodFirstPartyTypeKind3.ZodRecord,
        ...processCreateParams3(third)
      });
    }
    return new _ZodRecord2({
      keyType: ZodString3.create(),
      valueType: first,
      typeName: ZodFirstPartyTypeKind3.ZodRecord,
      ...processCreateParams3(second)
    });
  }
};
var ZodMap3 = class extends ZodType3 {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.map) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.map,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    const keyType = this._def.keyType;
    const valueType = this._def.valueType;
    const pairs = [...ctx.data.entries()].map(([key, value], index) => {
      return {
        key: keyType._parse(new ParseInputLazyPath3(ctx, key, ctx.path, [index, "key"])),
        value: valueType._parse(new ParseInputLazyPath3(ctx, value, ctx.path, [index, "value"]))
      };
    });
    if (ctx.common.async) {
      const finalMap = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const pair of pairs) {
          const key = await pair.key;
          const value = await pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID3;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      });
    } else {
      const finalMap = /* @__PURE__ */ new Map();
      for (const pair of pairs) {
        const key = pair.key;
        const value = pair.value;
        if (key.status === "aborted" || value.status === "aborted") {
          return INVALID3;
        }
        if (key.status === "dirty" || value.status === "dirty") {
          status.dirty();
        }
        finalMap.set(key.value, value.value);
      }
      return { status: status.value, value: finalMap };
    }
  }
};
ZodMap3.create = (keyType, valueType, params) => {
  return new ZodMap3({
    valueType,
    keyType,
    typeName: ZodFirstPartyTypeKind3.ZodMap,
    ...processCreateParams3(params)
  });
};
var ZodSet3 = class _ZodSet2 extends ZodType3 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.set) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.set,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    const def = this._def;
    if (def.minSize !== null) {
      if (ctx.data.size < def.minSize.value) {
        addIssueToContext3(ctx, {
          code: ZodIssueCode3.too_small,
          minimum: def.minSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.minSize.message
        });
        status.dirty();
      }
    }
    if (def.maxSize !== null) {
      if (ctx.data.size > def.maxSize.value) {
        addIssueToContext3(ctx, {
          code: ZodIssueCode3.too_big,
          maximum: def.maxSize.value,
          type: "set",
          inclusive: true,
          exact: false,
          message: def.maxSize.message
        });
        status.dirty();
      }
    }
    const valueType = this._def.valueType;
    function finalizeSet(elements2) {
      const parsedSet = /* @__PURE__ */ new Set();
      for (const element of elements2) {
        if (element.status === "aborted")
          return INVALID3;
        if (element.status === "dirty")
          status.dirty();
        parsedSet.add(element.value);
      }
      return { status: status.value, value: parsedSet };
    }
    const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath3(ctx, item, ctx.path, i)));
    if (ctx.common.async) {
      return Promise.all(elements).then((elements2) => finalizeSet(elements2));
    } else {
      return finalizeSet(elements);
    }
  }
  min(minSize, message) {
    return new _ZodSet2({
      ...this._def,
      minSize: { value: minSize, message: errorUtil3.toString(message) }
    });
  }
  max(maxSize, message) {
    return new _ZodSet2({
      ...this._def,
      maxSize: { value: maxSize, message: errorUtil3.toString(message) }
    });
  }
  size(size, message) {
    return this.min(size, message).max(size, message);
  }
  nonempty(message) {
    return this.min(1, message);
  }
};
ZodSet3.create = (valueType, params) => {
  return new ZodSet3({
    valueType,
    minSize: null,
    maxSize: null,
    typeName: ZodFirstPartyTypeKind3.ZodSet,
    ...processCreateParams3(params)
  });
};
var ZodFunction3 = class _ZodFunction2 extends ZodType3 {
  constructor() {
    super(...arguments);
    this.validate = this.implement;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.function) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.function,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    function makeArgsIssue(args, error) {
      return makeIssue3({
        data: args,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap3(), en_default3].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode3.invalid_arguments,
          argumentsError: error
        }
      });
    }
    function makeReturnsIssue(returns, error) {
      return makeIssue3({
        data: returns,
        path: ctx.path,
        errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap3(), en_default3].filter((x) => !!x),
        issueData: {
          code: ZodIssueCode3.invalid_return_type,
          returnTypeError: error
        }
      });
    }
    const params = { errorMap: ctx.common.contextualErrorMap };
    const fn = ctx.data;
    if (this._def.returns instanceof ZodPromise3) {
      const me = this;
      return OK3(async function(...args) {
        const error = new ZodError3([]);
        const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
          error.addIssue(makeArgsIssue(args, e));
          throw error;
        });
        const result = await Reflect.apply(fn, this, parsedArgs);
        const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
          error.addIssue(makeReturnsIssue(result, e));
          throw error;
        });
        return parsedReturns;
      });
    } else {
      const me = this;
      return OK3(function(...args) {
        const parsedArgs = me._def.args.safeParse(args, params);
        if (!parsedArgs.success) {
          throw new ZodError3([makeArgsIssue(args, parsedArgs.error)]);
        }
        const result = Reflect.apply(fn, this, parsedArgs.data);
        const parsedReturns = me._def.returns.safeParse(result, params);
        if (!parsedReturns.success) {
          throw new ZodError3([makeReturnsIssue(result, parsedReturns.error)]);
        }
        return parsedReturns.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...items) {
    return new _ZodFunction2({
      ...this._def,
      args: ZodTuple3.create(items).rest(ZodUnknown3.create())
    });
  }
  returns(returnType) {
    return new _ZodFunction2({
      ...this._def,
      returns: returnType
    });
  }
  implement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  strictImplement(func) {
    const validatedFunc = this.parse(func);
    return validatedFunc;
  }
  static create(args, returns, params) {
    return new _ZodFunction2({
      args: args ? args : ZodTuple3.create([]).rest(ZodUnknown3.create()),
      returns: returns || ZodUnknown3.create(),
      typeName: ZodFirstPartyTypeKind3.ZodFunction,
      ...processCreateParams3(params)
    });
  }
};
var ZodLazy3 = class extends ZodType3 {
  get schema() {
    return this._def.getter();
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const lazySchema = this._def.getter();
    return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
  }
};
ZodLazy3.create = (getter, params) => {
  return new ZodLazy3({
    getter,
    typeName: ZodFirstPartyTypeKind3.ZodLazy,
    ...processCreateParams3(params)
  });
};
var ZodLiteral3 = class extends ZodType3 {
  _parse(input) {
    if (input.data !== this._def.value) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        received: ctx.data,
        code: ZodIssueCode3.invalid_literal,
        expected: this._def.value
      });
      return INVALID3;
    }
    return { status: "valid", value: input.data };
  }
  get value() {
    return this._def.value;
  }
};
ZodLiteral3.create = (value, params) => {
  return new ZodLiteral3({
    value,
    typeName: ZodFirstPartyTypeKind3.ZodLiteral,
    ...processCreateParams3(params)
  });
};
function createZodEnum3(values, params) {
  return new ZodEnum3({
    values,
    typeName: ZodFirstPartyTypeKind3.ZodEnum,
    ...processCreateParams3(params)
  });
}
var ZodEnum3 = class _ZodEnum2 extends ZodType3 {
  _parse(input) {
    if (typeof input.data !== "string") {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext3(ctx, {
        expected: util3.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode3.invalid_type
      });
      return INVALID3;
    }
    if (!this._cache) {
      this._cache = new Set(this._def.values);
    }
    if (!this._cache.has(input.data)) {
      const ctx = this._getOrReturnCtx(input);
      const expectedValues = this._def.values;
      addIssueToContext3(ctx, {
        received: ctx.data,
        code: ZodIssueCode3.invalid_enum_value,
        options: expectedValues
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Values() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  get Enum() {
    const enumValues = {};
    for (const val of this._def.values) {
      enumValues[val] = val;
    }
    return enumValues;
  }
  extract(values, newDef = this._def) {
    return _ZodEnum2.create(values, {
      ...this._def,
      ...newDef
    });
  }
  exclude(values, newDef = this._def) {
    return _ZodEnum2.create(this.options.filter((opt) => !values.includes(opt)), {
      ...this._def,
      ...newDef
    });
  }
};
ZodEnum3.create = createZodEnum3;
var ZodNativeEnum3 = class extends ZodType3 {
  _parse(input) {
    const nativeEnumValues = util3.getValidEnumValues(this._def.values);
    const ctx = this._getOrReturnCtx(input);
    if (ctx.parsedType !== ZodParsedType3.string && ctx.parsedType !== ZodParsedType3.number) {
      const expectedValues = util3.objectValues(nativeEnumValues);
      addIssueToContext3(ctx, {
        expected: util3.joinValues(expectedValues),
        received: ctx.parsedType,
        code: ZodIssueCode3.invalid_type
      });
      return INVALID3;
    }
    if (!this._cache) {
      this._cache = new Set(util3.getValidEnumValues(this._def.values));
    }
    if (!this._cache.has(input.data)) {
      const expectedValues = util3.objectValues(nativeEnumValues);
      addIssueToContext3(ctx, {
        received: ctx.data,
        code: ZodIssueCode3.invalid_enum_value,
        options: expectedValues
      });
      return INVALID3;
    }
    return OK3(input.data);
  }
  get enum() {
    return this._def.values;
  }
};
ZodNativeEnum3.create = (values, params) => {
  return new ZodNativeEnum3({
    values,
    typeName: ZodFirstPartyTypeKind3.ZodNativeEnum,
    ...processCreateParams3(params)
  });
};
var ZodPromise3 = class extends ZodType3 {
  unwrap() {
    return this._def.type;
  }
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    if (ctx.parsedType !== ZodParsedType3.promise && ctx.common.async === false) {
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.promise,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    const promisified = ctx.parsedType === ZodParsedType3.promise ? ctx.data : Promise.resolve(ctx.data);
    return OK3(promisified.then((data) => {
      return this._def.type.parseAsync(data, {
        path: ctx.path,
        errorMap: ctx.common.contextualErrorMap
      });
    }));
  }
};
ZodPromise3.create = (schema, params) => {
  return new ZodPromise3({
    type: schema,
    typeName: ZodFirstPartyTypeKind3.ZodPromise,
    ...processCreateParams3(params)
  });
};
var ZodEffects3 = class extends ZodType3 {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === ZodFirstPartyTypeKind3.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    const effect = this._def.effect || null;
    const checkCtx = {
      addIssue: (arg) => {
        addIssueToContext3(ctx, arg);
        if (arg.fatal) {
          status.abort();
        } else {
          status.dirty();
        }
      },
      get path() {
        return ctx.path;
      }
    };
    checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
    if (effect.type === "preprocess") {
      const processed = effect.transform(ctx.data, checkCtx);
      if (ctx.common.async) {
        return Promise.resolve(processed).then(async (processed2) => {
          if (status.value === "aborted")
            return INVALID3;
          const result = await this._def.schema._parseAsync({
            data: processed2,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID3;
          if (result.status === "dirty")
            return DIRTY3(result.value);
          if (status.value === "dirty")
            return DIRTY3(result.value);
          return result;
        });
      } else {
        if (status.value === "aborted")
          return INVALID3;
        const result = this._def.schema._parseSync({
          data: processed,
          path: ctx.path,
          parent: ctx
        });
        if (result.status === "aborted")
          return INVALID3;
        if (result.status === "dirty")
          return DIRTY3(result.value);
        if (status.value === "dirty")
          return DIRTY3(result.value);
        return result;
      }
    }
    if (effect.type === "refinement") {
      const executeRefinement = (acc) => {
        const result = effect.refinement(acc, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(result);
        }
        if (result instanceof Promise) {
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        }
        return acc;
      };
      if (ctx.common.async === false) {
        const inner = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inner.status === "aborted")
          return INVALID3;
        if (inner.status === "dirty")
          status.dirty();
        executeRefinement(inner.value);
        return { status: status.value, value: inner.value };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
          if (inner.status === "aborted")
            return INVALID3;
          if (inner.status === "dirty")
            status.dirty();
          return executeRefinement(inner.value).then(() => {
            return { status: status.value, value: inner.value };
          });
        });
      }
    }
    if (effect.type === "transform") {
      if (ctx.common.async === false) {
        const base = this._def.schema._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (!isValid3(base))
          return INVALID3;
        const result = effect.transform(base.value, checkCtx);
        if (result instanceof Promise) {
          throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
        }
        return { status: status.value, value: result };
      } else {
        return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
          if (!isValid3(base))
            return INVALID3;
          return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
            status: status.value,
            value: result
          }));
        });
      }
    }
    util3.assertNever(effect);
  }
};
ZodEffects3.create = (schema, effect, params) => {
  return new ZodEffects3({
    schema,
    typeName: ZodFirstPartyTypeKind3.ZodEffects,
    effect,
    ...processCreateParams3(params)
  });
};
ZodEffects3.createWithPreprocess = (preprocess, schema, params) => {
  return new ZodEffects3({
    schema,
    effect: { type: "preprocess", transform: preprocess },
    typeName: ZodFirstPartyTypeKind3.ZodEffects,
    ...processCreateParams3(params)
  });
};
var ZodOptional3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType3.undefined) {
      return OK3(void 0);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodOptional3.create = (type, params) => {
  return new ZodOptional3({
    innerType: type,
    typeName: ZodFirstPartyTypeKind3.ZodOptional,
    ...processCreateParams3(params)
  });
};
var ZodNullable3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType === ZodParsedType3.null) {
      return OK3(null);
    }
    return this._def.innerType._parse(input);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodNullable3.create = (type, params) => {
  return new ZodNullable3({
    innerType: type,
    typeName: ZodFirstPartyTypeKind3.ZodNullable,
    ...processCreateParams3(params)
  });
};
var ZodDefault3 = class extends ZodType3 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    let data = ctx.data;
    if (ctx.parsedType === ZodParsedType3.undefined) {
      data = this._def.defaultValue();
    }
    return this._def.innerType._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
};
ZodDefault3.create = (type, params) => {
  return new ZodDefault3({
    innerType: type,
    typeName: ZodFirstPartyTypeKind3.ZodDefault,
    defaultValue: typeof params.default === "function" ? params.default : () => params.default,
    ...processCreateParams3(params)
  });
};
var ZodCatch3 = class extends ZodType3 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const newCtx = {
      ...ctx,
      common: {
        ...ctx.common,
        issues: []
      }
    };
    const result = this._def.innerType._parse({
      data: newCtx.data,
      path: newCtx.path,
      parent: {
        ...newCtx
      }
    });
    if (isAsync3(result)) {
      return result.then((result2) => {
        return {
          status: "valid",
          value: result2.status === "valid" ? result2.value : this._def.catchValue({
            get error() {
              return new ZodError3(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      });
    } else {
      return {
        status: "valid",
        value: result.status === "valid" ? result.value : this._def.catchValue({
          get error() {
            return new ZodError3(newCtx.common.issues);
          },
          input: newCtx.data
        })
      };
    }
  }
  removeCatch() {
    return this._def.innerType;
  }
};
ZodCatch3.create = (type, params) => {
  return new ZodCatch3({
    innerType: type,
    typeName: ZodFirstPartyTypeKind3.ZodCatch,
    catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
    ...processCreateParams3(params)
  });
};
var ZodNaN3 = class extends ZodType3 {
  _parse(input) {
    const parsedType = this._getType(input);
    if (parsedType !== ZodParsedType3.nan) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext3(ctx, {
        code: ZodIssueCode3.invalid_type,
        expected: ZodParsedType3.nan,
        received: ctx.parsedType
      });
      return INVALID3;
    }
    return { status: "valid", value: input.data };
  }
};
ZodNaN3.create = (params) => {
  return new ZodNaN3({
    typeName: ZodFirstPartyTypeKind3.ZodNaN,
    ...processCreateParams3(params)
  });
};
var BRAND3 = /* @__PURE__ */ Symbol("zod_brand");
var ZodBranded3 = class extends ZodType3 {
  _parse(input) {
    const { ctx } = this._processInputParams(input);
    const data = ctx.data;
    return this._def.type._parse({
      data,
      path: ctx.path,
      parent: ctx
    });
  }
  unwrap() {
    return this._def.type;
  }
};
var ZodPipeline3 = class _ZodPipeline2 extends ZodType3 {
  _parse(input) {
    const { status, ctx } = this._processInputParams(input);
    if (ctx.common.async) {
      const handleAsync = async () => {
        const inResult = await this._def.in._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID3;
        if (inResult.status === "dirty") {
          status.dirty();
          return DIRTY3(inResult.value);
        } else {
          return this._def.out._parseAsync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      };
      return handleAsync();
    } else {
      const inResult = this._def.in._parseSync({
        data: ctx.data,
        path: ctx.path,
        parent: ctx
      });
      if (inResult.status === "aborted")
        return INVALID3;
      if (inResult.status === "dirty") {
        status.dirty();
        return {
          status: "dirty",
          value: inResult.value
        };
      } else {
        return this._def.out._parseSync({
          data: inResult.value,
          path: ctx.path,
          parent: ctx
        });
      }
    }
  }
  static create(a, b) {
    return new _ZodPipeline2({
      in: a,
      out: b,
      typeName: ZodFirstPartyTypeKind3.ZodPipeline
    });
  }
};
var ZodReadonly3 = class extends ZodType3 {
  _parse(input) {
    const result = this._def.innerType._parse(input);
    const freeze = (data) => {
      if (isValid3(data)) {
        data.value = Object.freeze(data.value);
      }
      return data;
    };
    return isAsync3(result) ? result.then((data) => freeze(data)) : freeze(result);
  }
  unwrap() {
    return this._def.innerType;
  }
};
ZodReadonly3.create = (type, params) => {
  return new ZodReadonly3({
    innerType: type,
    typeName: ZodFirstPartyTypeKind3.ZodReadonly,
    ...processCreateParams3(params)
  });
};
function cleanParams3(params, data) {
  const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
  const p2 = typeof p === "string" ? { message: p } : p;
  return p2;
}
function custom3(check, _params = {}, fatal) {
  if (check)
    return ZodAny3.create().superRefine((data, ctx) => {
      const r = check(data);
      if (r instanceof Promise) {
        return r.then((r2) => {
          if (!r2) {
            const params = cleanParams3(_params, data);
            const _fatal = params.fatal ?? fatal ?? true;
            ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
          }
        });
      }
      if (!r) {
        const params = cleanParams3(_params, data);
        const _fatal = params.fatal ?? fatal ?? true;
        ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
      }
      return;
    });
  return ZodAny3.create();
}
var late3 = {
  object: ZodObject3.lazycreate
};
var ZodFirstPartyTypeKind3;
(function(ZodFirstPartyTypeKind22) {
  ZodFirstPartyTypeKind22["ZodString"] = "ZodString";
  ZodFirstPartyTypeKind22["ZodNumber"] = "ZodNumber";
  ZodFirstPartyTypeKind22["ZodNaN"] = "ZodNaN";
  ZodFirstPartyTypeKind22["ZodBigInt"] = "ZodBigInt";
  ZodFirstPartyTypeKind22["ZodBoolean"] = "ZodBoolean";
  ZodFirstPartyTypeKind22["ZodDate"] = "ZodDate";
  ZodFirstPartyTypeKind22["ZodSymbol"] = "ZodSymbol";
  ZodFirstPartyTypeKind22["ZodUndefined"] = "ZodUndefined";
  ZodFirstPartyTypeKind22["ZodNull"] = "ZodNull";
  ZodFirstPartyTypeKind22["ZodAny"] = "ZodAny";
  ZodFirstPartyTypeKind22["ZodUnknown"] = "ZodUnknown";
  ZodFirstPartyTypeKind22["ZodNever"] = "ZodNever";
  ZodFirstPartyTypeKind22["ZodVoid"] = "ZodVoid";
  ZodFirstPartyTypeKind22["ZodArray"] = "ZodArray";
  ZodFirstPartyTypeKind22["ZodObject"] = "ZodObject";
  ZodFirstPartyTypeKind22["ZodUnion"] = "ZodUnion";
  ZodFirstPartyTypeKind22["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
  ZodFirstPartyTypeKind22["ZodIntersection"] = "ZodIntersection";
  ZodFirstPartyTypeKind22["ZodTuple"] = "ZodTuple";
  ZodFirstPartyTypeKind22["ZodRecord"] = "ZodRecord";
  ZodFirstPartyTypeKind22["ZodMap"] = "ZodMap";
  ZodFirstPartyTypeKind22["ZodSet"] = "ZodSet";
  ZodFirstPartyTypeKind22["ZodFunction"] = "ZodFunction";
  ZodFirstPartyTypeKind22["ZodLazy"] = "ZodLazy";
  ZodFirstPartyTypeKind22["ZodLiteral"] = "ZodLiteral";
  ZodFirstPartyTypeKind22["ZodEnum"] = "ZodEnum";
  ZodFirstPartyTypeKind22["ZodEffects"] = "ZodEffects";
  ZodFirstPartyTypeKind22["ZodNativeEnum"] = "ZodNativeEnum";
  ZodFirstPartyTypeKind22["ZodOptional"] = "ZodOptional";
  ZodFirstPartyTypeKind22["ZodNullable"] = "ZodNullable";
  ZodFirstPartyTypeKind22["ZodDefault"] = "ZodDefault";
  ZodFirstPartyTypeKind22["ZodCatch"] = "ZodCatch";
  ZodFirstPartyTypeKind22["ZodPromise"] = "ZodPromise";
  ZodFirstPartyTypeKind22["ZodBranded"] = "ZodBranded";
  ZodFirstPartyTypeKind22["ZodPipeline"] = "ZodPipeline";
  ZodFirstPartyTypeKind22["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind3 || (ZodFirstPartyTypeKind3 = {}));
var instanceOfType3 = (cls, params = {
  message: `Input not instance of ${cls.name}`
}) => custom3((data) => data instanceof cls, params);
var stringType3 = ZodString3.create;
var numberType3 = ZodNumber3.create;
var nanType3 = ZodNaN3.create;
var bigIntType3 = ZodBigInt3.create;
var booleanType3 = ZodBoolean3.create;
var dateType3 = ZodDate3.create;
var symbolType3 = ZodSymbol3.create;
var undefinedType3 = ZodUndefined3.create;
var nullType3 = ZodNull3.create;
var anyType3 = ZodAny3.create;
var unknownType3 = ZodUnknown3.create;
var neverType3 = ZodNever3.create;
var voidType3 = ZodVoid3.create;
var arrayType3 = ZodArray3.create;
var objectType3 = ZodObject3.create;
var strictObjectType3 = ZodObject3.strictCreate;
var unionType3 = ZodUnion3.create;
var discriminatedUnionType3 = ZodDiscriminatedUnion3.create;
var intersectionType3 = ZodIntersection3.create;
var tupleType3 = ZodTuple3.create;
var recordType3 = ZodRecord3.create;
var mapType3 = ZodMap3.create;
var setType3 = ZodSet3.create;
var functionType3 = ZodFunction3.create;
var lazyType3 = ZodLazy3.create;
var literalType3 = ZodLiteral3.create;
var enumType3 = ZodEnum3.create;
var nativeEnumType3 = ZodNativeEnum3.create;
var promiseType3 = ZodPromise3.create;
var effectsType3 = ZodEffects3.create;
var optionalType3 = ZodOptional3.create;
var nullableType3 = ZodNullable3.create;
var preprocessType3 = ZodEffects3.createWithPreprocess;
var pipelineType3 = ZodPipeline3.create;
var ostring3 = () => stringType3().optional();
var onumber3 = () => numberType3().optional();
var oboolean3 = () => booleanType3().optional();
var coerce3 = {
  string: ((arg) => ZodString3.create({ ...arg, coerce: true })),
  number: ((arg) => ZodNumber3.create({ ...arg, coerce: true })),
  boolean: ((arg) => ZodBoolean3.create({
    ...arg,
    coerce: true
  })),
  bigint: ((arg) => ZodBigInt3.create({ ...arg, coerce: true })),
  date: ((arg) => ZodDate3.create({ ...arg, coerce: true }))
};
var NEVER3 = INVALID3;
function normalizePhone(raw) {
  if (raw == null) return null;
  const digits2 = String(raw).replace(/[^\d]/g, "");
  if (!digits2) return null;
  if (digits2.length === 10) return `+1${digits2}`;
  if (digits2.length >= 8 && digits2.length <= 15) return `+${digits2}`;
  return null;
}
var OFFERS_OPT_IN_PHRASES3 = { en: "YES OFFERS", es: "SI OFERTAS" };
var DAY_MS7 = 864e5;
var WEEK_MS5 = 7 * DAY_MS7;
var BRAIN_INTENTS3 = ["booking", "pricing", "hours", "services", "location", "complaint", "smalltalk", "other"];
var BRAIN_LANGUAGES3 = ["en", "es", "other"];
var BRAIN_OUTPUT_JSON_SCHEMA3 = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Exactly what the customer receives, in their language, in the receptionist's voice. Nothing else goes here."
    },
    intent: {
      type: "string",
      enum: [...BRAIN_INTENTS3],
      description: "What the customer is after."
    },
    escalate: {
      type: "boolean",
      description: "True when a person should take over now: they asked for one, you cannot help, or a rule you were given says so."
    },
    reason: {
      type: "string",
      description: "One short sentence: why a person is needed, or why this answer might be wrong. Empty when neither applies."
    },
    confidence: {
      type: "number",
      description: "How sure you are that this reply is right and complete for this customer, from 0 to 1."
    },
    facts_used: {
      type: "array",
      items: { type: "string" },
      description: "The business facts this reply relied on, each in a few words (an hour, a service, a note). Empty when none."
    },
    language: {
      type: "string",
      enum: [...BRAIN_LANGUAGES3],
      description: "The language the reply is written in."
    }
  },
  required: ["reply", "intent", "escalate", "reason", "confidence", "facts_used", "language"],
  additionalProperties: false
};
var BrainOutputSchema3 = external_exports3.object({
  reply: external_exports3.string(),
  intent: external_exports3.enum(BRAIN_INTENTS3).catch("other"),
  escalate: external_exports3.boolean().catch(false),
  reason: external_exports3.string().catch("").transform((s) => s.trim().slice(0, 300)),
  confidence: external_exports3.number().catch(0).transform((n) => Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0),
  facts_used: external_exports3.array(external_exports3.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, 5).map((s) => s.slice(0, 80))),
  language: external_exports3.enum(BRAIN_LANGUAGES3).catch("other")
});
var WA_WINDOW_MS3 = 24 * 3600 * 1e3;
var CALL_HEARTBEAT_MS3 = 10 * 60 * 1e3;
var TIME_FMT4 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DATE_FMT8 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var POLICY_CLASS_WORDS3 = {
  reply: { name: "Replies to customers", short: "Replies", note: "every text the receptionist sends" },
  faq: { name: "Service & pricing questions", short: "Questions", note: "auto answers from your business profile \xB7 ask hands every service or pricing question to you, on WhatsApp and on the phone" },
  booking: { name: "Book \xB7 reschedule", short: "Bookings", note: "auto sends your booking link \xB7 ask has a person confirm instead, on WhatsApp and on the phone" },
  reengage: { name: "Re-engage quiet customers", short: "Re-engage", note: "the win-back and save-our-number playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  campaign: { name: "Standing offers", short: "Offers", note: "the welcome and month's-offer playbooks \xB7 auto sends each run, veto sends it 30 minutes later unless you stop it, ask leaves it waiting on Today, never runs nothing" },
  reviews: { name: "Google reviews", short: "Reviews", note: "replies under new reviews on Google, through the connected Business Profile \xB7 auto answers each within the hour, ask drafts one for you to send, never leaves them all to you" },
  money: { name: "Refunds \xB7 rates \xB7 negotiation", short: "Money", note: "always goes to you" }
};
var PolicyLimitsSchema3 = external_exports3.object({
  max_replies_day: external_exports3.number().int().min(1).max(200).optional(),
  pause_hours: external_exports3.number().int().min(1).max(168).optional(),
  /**
   * How long the receptionist WAITS before its own reply goes out, in ms.
   *
   * Only meaningful when mode is 'veto'. A text channel is not a phone
   * call — nobody expects an answer in under a second — so the delay costs
   * the customer nothing and buys the business a window to redirect the bot
   * before it speaks, rather than apologising for it afterwards.
   */
  reply_delay_ms: external_exports3.number().int().min(5e3).max(6e5).optional(),
  /**
   * The confidence dial. Under 'auto', a reply the model is less sure about
   * than this waits in the hold window (reply_delay_ms) for a person instead
   * of going straight out — sure enough sends itself, not sure enough waits.
   * 0 or absent means off.
   */
  min_confidence: external_exports3.number().min(0).max(1).optional(),
  /**
   * The day's token budget: model tokens in and out over a rolling 24
   * hours, read from the usage events every reply writes. Over it the
   * receptionist stops and files a `budget` escalation, as it does at the
   * reply cap. 0 or absent is off; a value is at least a thousand, because
   * a budget of ten would be a mute button with a misleading name.
   */
  max_llm_tokens_day: external_exports3.number().int().min(0).max(5e6).refine((n) => n === 0 || n >= 1e3, "at least 1,000, or 0 to turn it off").optional()
}).strict();
var TIME3 = external_exports3.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
var IntervalSchema3 = external_exports3.object({ open: TIME3, close: TIME3 });
var HoursSchema3 = external_exports3.object({
  /** "09:00". Absent or null = closed that day, which is a real answer. */
  open: TIME3.nullable().optional(),
  close: TIME3.nullable().optional(),
  /**
   * Split shifts — 09:30-13:00 and 15:00-19:00, the lunch break a salon
   * actually keeps. Additive: a day that has always been one stretch keeps
   * saying so with open/close, and no stored config is rewritten.
   */
  intervals: external_exports3.array(IntervalSchema3).optional()
}).strict();
var DATE3 = external_exports3.string().regex(/^\d{4}-\d{2}-\d{2}$/);
var ClosureSchema3 = external_exports3.object({
  date: DATE3,
  until: DATE3.optional(),
  note: external_exports3.string().max(200).optional()
});
var DAYS3 = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
var ServiceSchema3 = external_exports3.object({
  name: external_exports3.string().min(1).max(80),
  /** Minutes. The receptionist is asked "how long does it take" constantly. */
  duration_min: external_exports3.number().int().min(1).max(1440).optional(),
  /**
   * Free text, not a number, and deliberately so: "from $45", "quoted at
   * consult", "varies by length". A price the business cannot state flatly
   * must not be forced into a field that looks like it can.
   */
  price_note: external_exports3.string().max(120).optional()
}).strict();
var GuardrailsSchema3 = external_exports3.object({
  never_quote_prices: external_exports3.boolean().optional(),
  never_confirm_booking: external_exports3.boolean().optional(),
  disclose_ai: external_exports3.boolean().optional(),
  /**
   * OPT-IN, unlike the three above. Those default on because absent means
   * "the safe reading"; this one arrived after prompts were live, and a
   * rule that defaulted on would have changed every composed prompt in
   * production the moment it deployed.
   */
  no_health_advice: external_exports3.boolean().optional()
}).strict();
var NoteSchema3 = external_exports3.object({
  title: external_exports3.string().min(1).max(80),
  text: external_exports3.string().min(1).max(1200)
}).strict();
var BookingRulesSchema3 = external_exports3.object({
  /** Least notice for a slot, in hours. Absent = 2. */
  lead_hours: external_exports3.number().int().min(0).max(168).optional(),
  /** Gap kept around each existing appointment, in minutes. Absent = 0. */
  buffer_min: external_exports3.number().int().min(0).max(120).optional(),
  /** How far ahead open times are offered, in days. Absent = 14. */
  max_days_ahead: external_exports3.number().int().min(1).max(90).optional(),
  /** The shortest window worth naming, in minutes. Absent = 30. */
  slot_min: external_exports3.number().int().min(15).max(240).optional(),
  /** Services that need a consultation before they can be booked. */
  consult_first: external_exports3.array(external_exports3.string().min(1).max(80)).max(20).optional(),
  party_max: external_exports3.number().int().min(1).max(20).optional(),
  /** Anything else about booking, one short line each. */
  notes: external_exports3.array(external_exports3.string().min(1).max(200)).max(10).optional()
}).strict();
var E1643 = /^\+[1-9]\d{6,14}$/;
var BusinessProfileSchema3 = external_exports3.object({
  address: external_exports3.string().max(300).optional(),
  hours: external_exports3.record(external_exports3.enum(DAYS3), HoursSchema3).optional(),
  /** Dates the business is shut regardless of the weekly grid. */
  closures: external_exports3.array(ClosureSchema3).optional(),
  services: external_exports3.array(ServiceSchema3).max(60).optional(),
  languages: external_exports3.array(external_exports3.string().min(2).max(40)).max(8).optional(),
  guardrails: GuardrailsSchema3.optional(),
  /** What must reach a person. One short line each. */
  escalate_when: external_exports3.array(external_exports3.string().min(1).max(200)).max(20).optional(),
  tone: external_exports3.string().max(200).optional(),
  /**
   * The line a PERSON answers. The phone receptionist warm-transfers here
   * during opening hours; absent, it takes a message instead. Never the
   * receptionist's own line — that would ring itself.
   */
  handoff_number: external_exports3.string().regex(E1643, "E.164, like +16469325775").optional(),
  website: external_exports3.string().url().max(500).optional(),
  notes: external_exports3.array(NoteSchema3).max(10).optional(),
  booking_rules: BookingRulesSchema3.optional(),
  /**
   * Anything the owner wants said that no field covers.
   *
   * The escape hatch that keeps this model honest — without it, structuring
   * the facts would mean losing whatever did not fit, and the first migration
   * would be a downgrade.
   */
  extra_instructions: external_exports3.string().max(8e3).optional()
}).strict();
var BrainConfigSchema3 = external_exports3.object({
  business_name: external_exports3.string().min(1).max(120),
  /**
   * The number the receptionist tells customers to call — an OVERRIDE, and
   * optional because it should almost never be set.
   *
   * It was required, free text, and named the same as the line the
   * receptionist answers, so every workspace typed something into it and
   * nothing checked what. On the first live salon that produced a
   * receptionist publishing the number it transfers to: customers who rang
   * it reached a person's mobile and never the receptionist standing by,
   * and the same string went to Google.
   *
   * Absent is now the right answer and the default: resolveFacts falls back
   * to the provisioned voice line, formatted for speech, so the number
   * published is the number answered by construction. A value here means a
   * business deliberately publishes something else — a tracking line, a
   * shopfront — and the pane says so in those words.
   */
  phone_display: external_exports3.string().min(3).max(40).optional(),
  booking_link: external_exports3.string().url().max(500),
  /** The complete system prompt the model receives — the "AI memory" pane's
   *  one hard promise is that what it shows is EXACTLY this, nothing more. */
  system_prompt: external_exports3.string().min(40).max(2e4),
  /**
   * The business's facts, as fields.
   *
   * Optional: every config written before this existed stays valid, and
   * nothing composes until a workspace actually fills it in. When present
   * it REPLACES system_prompt as the source the prompt is built from.
   */
  profile: BusinessProfileSchema3.optional(),
  fallbacks: external_exports3.object({
    /** Sent when no model key is configured. */
    greeting: external_exports3.string().min(1).max(2e3),
    /** Sent when the model call failed. */
    error: external_exports3.string().min(1).max(2e3),
    /** Sent for voice notes / photos before escalating. */
    non_text: external_exports3.string().min(1).max(2e3)
  }).strict()
}).strict();
var NotificationsConfigSchema3 = external_exports3.object({
  escalation_emails: external_exports3.array(external_exports3.string().email()).min(1).max(10),
  from: external_exports3.string().max(200).optional()
}).strict();
var CalendarConfigSchema3 = external_exports3.object({
  ical_url: external_exports3.string().max(2e3).refine((u) => /^(https?|webcal):\/\/\S+$/i.test(u), "An https:// or webcal:// address")
}).strict();
var FeaturesConfigSchema3 = external_exports3.object({ vision: external_exports3.boolean().optional() }).strict();
var TenantConfigSchema3 = external_exports3.object({
  brain: BrainConfigSchema3.optional(),
  notifications: NotificationsConfigSchema3.optional(),
  calendar: CalendarConfigSchema3.optional(),
  features: FeaturesConfigSchema3.optional()
});
var MAX_INTERVALS_PER_DAY3 = 4;
var MAX_CLOSURES3 = 60;
function isRealDate3(key) {
  const at2 = /* @__PURE__ */ new Date(`${key}T12:00:00Z`);
  return !Number.isNaN(at2.getTime()) && at2.toISOString().slice(0, 10) === key;
}
var DAY_NAME3 = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function checkDay3(h, day, ctx) {
  const name = DAY_NAME3[day] ?? day;
  const at2 = (...rest) => ["brain", "profile", "hours", day, ...rest];
  const open = h.open ?? void 0;
  const close = h.close ?? void 0;
  if (!!open !== !!close) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: at2(open ? "close" : "open"),
      message: `${name} needs both an opening and a closing time, or neither.`
    });
  }
  if (open && close && close <= open) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: at2("close"),
      message: `${name} closes at or before it opens.`
    });
  }
  const iv = h.intervals ?? [];
  if (iv.length > MAX_INTERVALS_PER_DAY3) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: at2("intervals"),
      message: `${name} can be split into at most ${MAX_INTERVALS_PER_DAY3} shifts.`
    });
  }
  iv.forEach((x, n) => {
    if (x.close <= x.open) {
      ctx.addIssue({
        code: external_exports3.ZodIssueCode.custom,
        path: at2("intervals", n, "close"),
        message: `${name}: a shift has to close after it opens.`
      });
    }
  });
  const sorted = [...iv].sort((a, b) => a.open < b.open ? -1 : a.open > b.open ? 1 : 0);
  for (let n = 1; n < sorted.length; n++) {
    if (sorted[n].open < sorted[n - 1].close) {
      ctx.addIssue({
        code: external_exports3.ZodIssueCode.custom,
        path: at2("intervals", n, "open"),
        message: `${name}: two shifts overlap.`
      });
    }
  }
}
function checkClosure3(c, n, ctx) {
  const at2 = (...rest) => ["brain", "profile", "closures", n, ...rest];
  if (!isRealDate3(c.date)) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: at2("date"),
      message: `${c.date} is not a date on the calendar.`
    });
  }
  if (c.until && !isRealDate3(c.until)) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: at2("until"),
      message: `${c.until} is not a date on the calendar.`
    });
  }
  if (c.until && c.until < c.date) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: at2("until"),
      message: "A closure cannot end before it starts."
    });
  }
}
var TenantConfigWriteSchema3 = TenantConfigSchema3.superRefine((cfg, ctx) => {
  const p = cfg.brain?.profile;
  if (!p) return;
  for (const [day, h] of Object.entries(p.hours ?? {})) if (h) checkDay3(h, day, ctx);
  if ((p.closures?.length ?? 0) > MAX_CLOSURES3) {
    ctx.addIssue({
      code: external_exports3.ZodIssueCode.custom,
      path: ["brain", "profile", "closures"],
      message: `At most ${MAX_CLOSURES3} closures.`
    });
  }
  (p.closures ?? []).forEach((c, n) => checkClosure3(c, n, ctx));
});
var SHORT3 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var LIVE_STALE_MS3 = 5 * 60 * 1e3;
var LIVE_OVERLONG_MS3 = 30 * 60 * 1e3;
var ANALYSIS_GRACE_MS3 = 10 * 60 * 1e3;
var DAY_MS23 = 864e5;
var WEEK_MS23 = 7 * DAY_MS23;
var MONTH_MS3 = 30 * DAY_MS23;
var NEW_WINDOW_MS3 = 7 * DAY_MS23;
var QUIET_AFTER_MS4 = 30 * DAY_MS23;
var DATE_FMT23 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DATE_YEAR_FMT3 = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" });
var TIME_FMT23 = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
var DAY_MS33 = 24 * 3600 * 1e3;
var ASK_CAPS3 = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10
};
var ASK_CITATION_KINDS3 = ["thread", "conversation", "call", "person", "page"];
var ASK_LANGUAGES3 = ["en", "es", "other"];
var ASK_FINISH_JSON_SCHEMA3 = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description: "The answer, in the person's language: two or three short sentences, under sixty words, unless they asked for detail (a transcript, a list). Plain text only: no markdown, no headings, and never a tag such as <answer> or <parameter> inside this string. More than two items go one per line, separated by newlines. Say what you found; if a read returned nothing, say so plainly."
    },
    citations: {
      type: "array",
      description: "The rows the answer rests on, taken ONLY from what the tools returned this turn, at most four \u2014 the ones the answer names. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ASK_CITATION_KINDS3] },
          id: { type: "string" },
          label: { type: "string" }
        },
        required: ["kind", "id", "label"],
        additionalProperties: false
      }
    },
    followups: {
      type: "array",
      description: "Up to two short questions the person might ask next, in their language. Empty when nothing natural follows.",
      items: { type: "string" }
    },
    navigate: {
      type: "object",
      description: "When the best answer is a page, the route to open and a label. to: the exact `route` field a tool returned for a row (a call, a thread, a person), or a page route (today, inbox, clients, conversations, live, reports, admin/workspace). Empty strings when there is nothing to open. now: true when the person asked to open, show or see that thing; the app goes there as soon as the answer is read, so keep the answer to one line.",
      properties: { to: { type: "string" }, label: { type: "string" }, now: { type: "boolean" } },
      required: ["to", "label", "now"],
      additionalProperties: false
    },
    language: { type: "string", enum: [...ASK_LANGUAGES3] }
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false
};
var clip3 = (n) => (s) => s.trim().slice(0, n);
var TAG_CUT3 = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
function cleanAnswer3(raw) {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT3);
  if (cut >= 0) s = s.slice(0, cut);
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}
var AskFinishSchema3 = external_exports3.object({
  answer: external_exports3.string().catch("").transform((s) => clip3(1500)(cleanAnswer3(s))),
  citations: external_exports3.array(
    external_exports3.object({
      kind: external_exports3.enum(ASK_CITATION_KINDS3).catch("page"),
      id: external_exports3.string().catch("").transform(clip3(200)),
      label: external_exports3.string().catch("").transform(clip3(80))
    })
  ).catch([]).transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS3.citations)),
  followups: external_exports3.array(external_exports3.string()).catch([]).transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS3.followups).map((s) => s.slice(0, 90))),
  navigate: external_exports3.object({ to: external_exports3.string().catch(""), label: external_exports3.string().catch(""), now: external_exports3.boolean().catch(false) }).catch({ to: "", label: "", now: false }).transform((n) => n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null),
  language: external_exports3.enum(ASK_LANGUAGES3).catch("other")
});
var AskProposalOutcomeSchema3 = external_exports3.object({
  state: external_exports3.enum(["done", "dismissed", "failed", "undone"]),
  receipt: external_exports3.string().max(300).catch(""),
  atMs: external_exports3.number().catch(0),
  undo: external_exports3.record(external_exports3.unknown()).nullable().optional()
});
var AskSettingsChangeSchema3 = external_exports3.discriminatedUnion("op", [
  external_exports3.object({ op: external_exports3.literal("add_closure"), date: external_exports3.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: external_exports3.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: external_exports3.string().max(200).optional() }),
  external_exports3.object({ op: external_exports3.literal("set_hours"), day: external_exports3.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: external_exports3.string().regex(/^\d{2}:\d{2}$/).nullable(), close: external_exports3.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  external_exports3.object({ op: external_exports3.literal("add_note"), title: external_exports3.string().min(1).max(80), text: external_exports3.string().min(1).max(1200) }),
  external_exports3.object({ op: external_exports3.literal("add_service"), name: external_exports3.string().min(1).max(80), duration_min: external_exports3.number().int().min(1).max(1440).optional() })
]);
var FIRST3 = { kind: "first_name", label: "First name", example: "Dani" };
var BUSINESS3 = { kind: "business_name", label: "Business name", example: "Luna Studio" };
var LINK3 = { kind: "booking_link", label: "Booking link", example: "https://booksy.com/luna-studio" };
var FIRST_ES3 = { ...FIRST3, label: "Nombre" };
var BUSINESS_ES3 = { ...BUSINESS3, label: "Nombre del negocio" };
var LINK_ES3 = { ...LINK3, label: "Enlace de reservas" };
var WHEN4 = { kind: "visit_when", label: "When", example: "tomorrow at 2:00 PM" };
var SERVICE3 = { kind: "visit_service", label: "Service", example: "a consultation" };
var WHEN_ES3 = { ...WHEN4, label: "Cu\xE1ndo", example: "ma\xF1ana a las 2:00 PM" };
var SERVICE_ES3 = { ...SERVICE3, label: "Servicio", example: "una consulta" };
var LIMIT_TIERS3 = {
  TIER_50: 50,
  TIER_250: 250,
  TIER_1K: 1e3,
  TIER_10K: 1e4,
  TIER_100K: 1e5,
  TIER_UNLIMITED: Number.POSITIVE_INFINITY
};
var DAY_MS43 = 864e5;
var PLAYBOOK_BREATH_MS3 = 7 * DAY_MS43;
var PLAYBOOK_VETO_DELAY_MS3 = 30 * 6e4;
var PLAYBOOK_CLASS_LABEL3 = {
  reengage: POLICY_CLASS_WORDS3.reengage.short,
  campaign: POLICY_CLASS_WORDS3.campaign.short,
  booking: POLICY_CLASS_WORDS3.booking.short
};
var DATE_FMT33 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WHEN23 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var DAY_MS53 = 864e5;
var QUIET_AFTER_MS23 = 7 * DAY_MS53;
var DATE_FMT43 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var FORWARDING_TEST_WINDOW_MS3 = 30 * 6e4;
var REVIEW_AUTO_REPLY_MAX_AGE_MS3 = 14 * 864e5;
var REVIEW_NEWS_MS3 = 36 * 3600 * 1e3;
var REVIEW_NEWS_MAX_AGE_MS3 = 14 * 864e5;
var BOOTSTRAP_MS3 = 3600 * 1e3;
var DATE_FMT53 = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
var WEEK_MS33 = 7 * 864e5;
var DATE_FMT63 = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
var SOLE_PROP_LIMITS3 = {
  campaignsPerBrand: 1,
  numbersPerCampaign: 1,
  messagesPerSecond: 1,
  perDayTMobile: 1e3,
  perMinuteAtt: 15,
  mobileUsesEver: 3,
  emailUsesEver: 10,
  addressUsesEver: 10
};
var REGISTRATION_COST_WORDS3 = {
  standard: "Filing costs about $19 once and a few dollars a month, and cannot be undone.",
  sole_proprietor: `Filing costs a few dollars once and a few dollars a month, and cannot be undone. You are filing as a sole proprietor: one number, one campaign, about ${SOLE_PROP_LIMITS3.messagesPerSecond} message a second.`
};
var SOLE_PROP_CEILING_SENTENCE3 = `This is the sole-proprietor registration: one number, and about ${SOLE_PROP_LIMITS3.messagesPerSecond} message a second, so a large send goes out over minutes rather than all at once.`;
var SOLE_PROP_TEXTING_SENTENCE3 = `Texting is on. ${SOLE_PROP_CEILING_SENTENCE3}`;
var SIGNUP_NAME_MIN3 = 2;
var SIGNUP_NAME_MAX3 = 120;
var SignupSchema3 = external_exports3.object({
  name: external_exports3.string().trim().min(SIGNUP_NAME_MIN3, "Give the business a name of at least 2 characters.").max(SIGNUP_NAME_MAX3, "That name is too long \u2014 120 characters at most."),
  email: external_exports3.string().trim().toLowerCase().email("Enter a work email address.").max(254),
  /** IANA zone from the device; the database validates it and the route retries without one it does not know. */
  timezone: external_exports3.string().trim().min(1).max(64).optional(),
  /** The invite code, when sign-up is by invitation. */
  code: external_exports3.string().trim().max(80).optional()
}).strict();
var CONSENT_PHRASE3 = OFFERS_OPT_IN_PHRASES3.en;
var CONSENT_PHRASE_ES3 = OFFERS_OPT_IN_PHRASES3.es;
async function recordOutbound(db, p) {
  const { data, error } = await db.from("messages").insert({
    tenant_id: p.tenantId,
    conversation_id: p.conversationId,
    contact_id: p.contactId,
    channel: p.channel ?? "whatsapp",
    direction: "outbound",
    sender: p.sender,
    type: p.type ?? "text",
    body: p.body,
    external_id: p.externalId,
    status: p.status ?? "sent",
    meta: p.meta ?? {}
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`record_outbound: ${error.message}`);
  }
  await Promise.all([
    db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversationId),
    emitEvent(db, p.tenantId, "message.sent", "message", "message", data.id, { sender: p.sender })
  ]);
  return data.id;
}
async function getOrCreateContact(db, tenantId, phoneE164) {
  const { data, error } = await db.from("contacts").insert({ tenant_id: tenantId, phone_e164: phoneE164, last_seen_at: (/* @__PURE__ */ new Date()).toISOString() }).select("id, consent, dnc").single();
  if (!error && data) return data;
  if (error && error.code !== "23505") throw new Error(`get_or_create_contact: ${error.message}`);
  const { data: raced, error: reErr } = await db.from("contacts").select("id, consent, dnc").eq("tenant_id", tenantId).eq("phone_e164", phoneE164).single();
  if (reErr || !raced) throw new Error(`get_or_create_contact reselect: ${reErr?.message}`);
  return raced;
}
async function resolveOutboundTarget(db, p) {
  const phone = normalizePhone(p.phoneE164);
  if (!phone) return null;
  const { data: existing, error: selErr } = await db.from("contacts").select("id, consent, dnc").eq("tenant_id", p.tenantId).eq("phone_e164", phone).maybeSingle();
  if (selErr) throw new Error(`resolve_outbound_target: ${selErr.message}`);
  let contact = existing;
  if (!contact) {
    if (!p.create) return null;
    contact = await getOrCreateContact(db, p.tenantId, phone);
  }
  const { data: conv, error: cErr } = await db.from("conversations").upsert(
    {
      tenant_id: p.tenantId,
      contact_id: contact.id,
      last_message_at: (/* @__PURE__ */ new Date()).toISOString()
    },
    { onConflict: "tenant_id,contact_id" }
  ).select("id, paused_until").single();
  if (cErr || !conv) throw new Error(`resolve_outbound_target conversation: ${cErr?.message}`);
  return {
    contactId: contact.id,
    conversationId: conv.id,
    pausedUntil: conv.paused_until ?? null,
    consent: contact.consent ?? null,
    dnc: contact.dnc ?? false
  };
}
async function emitEvent(db, tenantId, kind, category, subjectType, subjectId, data = {}) {
  const { error } = await db.from("events").insert({
    tenant_id: tenantId,
    kind,
    category,
    subject_type: subjectType,
    subject_id: subjectId,
    data
  });
  if (error) console.error("emit_event_failed", kind, error.message);
}
var POS_TTL_MS = 5 * 60 * 1e3;
var NEG_TTL_MS = 60 * 1e3;
var DAY_MS62 = 24 * 3600 * 1e3;

// src/handlers.ts
var SENDERS = {
  whatsapp: (ctx, to, p) => {
    const digits = to.replace(/^\+/, "");
    return p.template ? sendTemplate(ctx.waCfg, digits, p.template) : sendText(ctx.waCfg, digits, p.body);
  },
  // A text has no templates: the words go as they are, through the line's
  // Messaging Service. No line = a loud failure, never the other wire.
  sms: (ctx, to, p) => ctx.sms ? ctx.sms.send(to.startsWith("+") ? to : `+${to}`, p.body) : Promise.resolve({ ok: false, wamid: null, status: 503, errorBody: "no texting line" })
};
async function outboundSend(ctx, job) {
  const p = job.payload;
  const { data: msg, error: readErr } = await ctx.db.from("messages").select("id, status, body, template_name, channel, sender").eq("id", p.message_id).eq("tenant_id", job.tenant_id).maybeSingle();
  if (readErr) {
    throw new Error(`outbound_send: cannot read message ${p.message_id}: ${readErr.message}`);
  }
  if (!msg || msg.status !== "queued") return;
  const { data: convRow, error: consentErr } = await ctx.db.from("conversations").select("contacts (consent, dnc)").eq("id", p.conversation_id).eq("tenant_id", job.tenant_id).maybeSingle();
  if (consentErr || !convRow) {
    const why = consentErr?.message ?? "conversation not found";
    console.error(JSON.stringify({
      level: "error",
      event: "outbound_consent_unreadable",
      tenant_id: job.tenant_id,
      message_id: p.message_id,
      error: why
    }));
    throw new Error(`outbound_send: cannot read consent for conversation ${p.conversation_id}: ${why}`);
  }
  const contact = convRow.contacts;
  if (contact && isOptedOutContact(contact)) {
    await ctx.db.from("messages").update({ status: "canceled", error: { reason: "opted_out" } }).eq("id", p.message_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id,
      kind: "message.send_blocked",
      category: "message",
      subject_type: "message",
      subject_id: p.message_id,
      data: { reason: "opted_out", consent: contact.consent, dnc: contact.dnc }
    });
    return;
  }
  const channel = msg.channel ?? "whatsapp";
  const send = SENDERS[channel];
  if (!send) {
    console.error(JSON.stringify({
      level: "error",
      event: "outbound_no_sender_for_channel",
      tenant_id: job.tenant_id,
      message_id: p.message_id,
      channel
    }));
    await ctx.db.from("messages").update({ status: "failed", error: { reason: "no_sender_for_channel", channel } }).eq("id", p.message_id).eq("status", "queued");
    return;
  }
  const sent = await send(ctx, p.to_phone, { body: p.body ?? msg.body ?? "", template: p.template });
  if (sent.ok) {
    const { data: marked } = await ctx.db.from("messages").update({ status: "sent", ...sent.wamid ? { external_id: sent.wamid } : {} }).eq("id", p.message_id).eq("status", "queued").select("id");
    if (!marked || marked.length === 0) {
      console.error("outbound_sent_but_row_not_queued", p.message_id, sent.wamid);
      await ctx.db.from("events").insert({
        tenant_id: job.tenant_id,
        kind: "message.send_raced_cancel",
        category: "message",
        subject_type: "message",
        subject_id: p.message_id,
        data: { wamid: sent.wamid }
      });
    }
    await ctx.db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversation_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id,
      kind: "message.sent",
      category: "message",
      // Read from the ROW, not hardcoded. This queue used to carry only human
      // replies; under a veto window the receptionist's own reply travels the
      // same path, and stamping every send as "human" would make the metrics
      // report a bot's words as a person's.
      subject_type: "message",
      subject_id: p.message_id,
      data: { sender: msg.sender ?? "human" }
    });
  } else {
    await ctx.db.from("messages").update({ status: "failed", error: { http_status: sent.status, body: sent.errorBody ?? null } }).eq("id", p.message_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id,
      kind: "message.send_failed",
      category: "message",
      subject_type: "message",
      subject_id: p.message_id,
      data: { http_status: sent.status }
    });
    await upsertEscalation(
      ctx.db,
      job.tenant_id,
      p.conversation_id,
      "send_failed",
      `Dashboard reply could not be delivered (HTTP ${sent.status}).`
    );
    await ctx.alert(
      `Reply delivery failed: ${p.to_phone}`,
      `A reply queued from the dashboard could not be sent (HTTP ${sent.status}). The thread is flagged in the Inbox.`
    );
  }
}
async function pauseExpire(ctx, job) {
  const p = job.payload;
  const { data: conv } = await ctx.db.from("conversations").select("id, state, paused_until").eq("id", p.conversation_id).single();
  if (!conv || conv.state !== "needs_human") return;
  if (conv.paused_until && new Date(conv.paused_until).getTime() > Date.now() + 1e3) return;
  await ctx.db.from("conversations").update({ state: "open", paused_until: null }).eq("id", p.conversation_id);
}
async function snoozeWake(ctx, job) {
  const p = job.payload;
  const { data: conv } = await ctx.db.from("conversations").select("id, state, snooze_until").eq("id", p.conversation_id).single();
  if (!conv || conv.state !== "snoozed") return;
  if (conv.snooze_until && new Date(conv.snooze_until).getTime() > Date.now() + 1e3) return;
  await ctx.db.from("conversations").update({ state: "open", snooze_until: null }).eq("id", p.conversation_id);
}
async function blobThreadErase(ctx, job) {
  const p = job.payload;
  if (p.scrubbed) return;
  if (!p.namespace) throw new Error("blob_thread_erase: payload has no namespace");
  const ids = (Array.isArray(p.thread_ids) ? p.thread_ids : []).filter((t) => typeof t === "string" && t.length > 0);
  if (!ctx.eraseThread) throw new Error("blob_thread_erase: no thread store on this runner");
  const failed = [];
  for (const id of ids) {
    if (!await ctx.eraseThread(p.namespace, id)) failed.push(id);
  }
  if (failed.length) throw new Error(`blob_thread_erase: ${failed.length} thread(s) not deleted`);
  const scrubbed = {
    contact_id: p.contact_id ?? null,
    namespace: p.namespace,
    threads: ids.length,
    scrubbed: true
  };
  if (p.contact_id) {
    await ctx.db.from("jobs").update({ payload: scrubbed }).eq("tenant_id", job.tenant_id).eq("kind", "blob_thread_erase").eq("payload->>contact_id", p.contact_id);
  } else {
    await ctx.db.from("jobs").update({ payload: scrubbed }).eq("id", job.id);
  }
  if (p.contact_id) {
    await ctx.db.from("decisions").insert({
      tenant_id: job.tenant_id,
      subject_type: "contact",
      subject_id: p.contact_id,
      verb: "erase",
      actor_type: "system",
      payload: { leg: "blob", threads: ids.length, job_id: job.id }
    });
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id,
      kind: "contact.blob_erased",
      category: "contact",
      subject_type: "contact",
      subject_id: p.contact_id,
      data: { threads: ids.length }
    });
  }
}
async function upsertEscalation(db, tenantId, conversationId, reason, details) {
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    reason,
    details
  });
  if (!error) return "opened";
  if (error.code === "23505") {
    await db.from("escalations").update({ details, reason }).eq("conversation_id", conversationId).eq("state", "open");
    return "refreshed";
  }
  console.error("escalation_upsert_failed", error.message);
  return "failed";
}
async function broadcastSend(ctx, job) {
  const p = job.payload;
  const { data: b, error: bErr } = await ctx.db.from("broadcasts").select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience").eq("id", p.broadcast_id).eq("tenant_id", job.tenant_id).maybeSingle();
  if (bErr) throw new Error(`broadcast_send: cannot read broadcast ${p.broadcast_id}: ${bErr.message}`);
  if (!b) return;
  if (b.state !== "scheduled" && b.state !== "sending") return;
  const { data: tenantState } = await ctx.db.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle();
  if (tenantState?.status === "paused") {
    await ctx.db.from("broadcasts").update({ state: "failed", failure: "paused", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", b.id);
    await ctx.alert(`Broadcast \u201C${b.name}\u201D not sent`, "The workspace is paused until billing resumes, so nothing went out. Resume from Settings \u203A Billing and send it again.");
    return;
  }
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  if (b.state === "scheduled") {
    await ctx.db.from("broadcasts").update({ state: "sending", started_at: startedAt }).eq("id", b.id).eq("state", "scheduled");
  }
  const { data: tpl } = await ctx.db.from("templates").select("meta_status, body_preview, category").eq("tenant_id", job.tenant_id).eq("channel", "whatsapp").eq("name", b.template_name).eq("language", b.template_language).maybeSingle();
  if (!tpl || tpl.meta_status !== "approved") {
    await ctx.db.from("broadcasts").update({ state: "failed", failure: "template_not_approved", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", b.id);
    await ctx.alert(`Broadcast \u201C${b.name}\u201D stopped`, `The template \u201C${b.template_name}\u201D is no longer approved by WhatsApp, so nothing was sent.`);
    return;
  }
  const purpose = purposeOfTemplate(tpl.category);
  const specs = Array.isArray(b.params) ? b.params.map((p2) => parseParamSpec(p2) ?? { kind: "text", value: String(p2) }) : [];
  const [{ data: tenantRow }, { data: cfgRow }] = await Promise.all([
    ctx.db.from("tenants").select("name").eq("id", job.tenant_id).maybeSingle(),
    ctx.db.from("tenant_config").select("config").eq("tenant_id", job.tenant_id).maybeSingle()
  ]);
  const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
  const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
  const bookingLink = parsedCfg?.brain?.booking_link ?? null;
  const { data: batch, error: qErr } = await ctx.db.from("broadcast_recipients").select("contact_id, facts").eq("broadcast_id", b.id).eq("state", "queued").limit(BROADCAST_CHUNK);
  if (qErr) throw new Error(`broadcast_send: cannot read recipients: ${qErr.message}`);
  const mark = (contactId, patch) => ctx.db.from("broadcast_recipients").update({ ...patch, sent_at: patch.state === "sent" ? (/* @__PURE__ */ new Date()).toISOString() : null }).eq("broadcast_id", b.id).eq("contact_id", contactId);
  for (const r of batch ?? []) {
    const { data: c, error: cErr } = await ctx.db.from("contacts").select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name").eq("id", r.contact_id).eq("tenant_id", job.tenant_id).maybeSingle();
    if (cErr) {
      console.error("broadcast_contact_unreadable", r.contact_id, cErr.message);
      continue;
    }
    if (!c || c.erased_at) {
      await mark(r.contact_id, { state: "skipped", reason: "erased" });
      continue;
    }
    if (!c.phone_e164) {
      await mark(r.contact_id, { state: "skipped", reason: "no_phone" });
      continue;
    }
    const allowed = mayMessageFor(c, purpose, { proactive: true });
    if (!allowed.ok) {
      await mark(r.contact_id, { state: "skipped", reason: allowed.reason ?? "not_opted_in" });
      continue;
    }
    const target = await resolveOutboundTarget(ctx.db, { tenantId: job.tenant_id, phoneE164: c.phone_e164, create: false });
    if (!target) {
      await mark(r.contact_id, { state: "skipped", reason: "no_phone" });
      continue;
    }
    if (target.pausedUntil && Date.now() < new Date(target.pausedUntil).getTime()) {
      await mark(r.contact_id, { state: "skipped", reason: "human_has_it" });
      continue;
    }
    const facts = r.facts !== null && typeof r.facts === "object" && !Array.isArray(r.facts) ? r.facts : {};
    const params = resolveParams(specs, {
      firstName: firstNameOf(c.display_name, c.wa_profile_name),
      businessName,
      bookingLink,
      visitWhen: typeof facts.visit_when === "string" ? facts.visit_when : null,
      visitService: typeof facts.visit_service === "string" ? facts.visit_service : null
    });
    if (params.some((v) => !v)) {
      await mark(r.contact_id, { state: "skipped", reason: "missing_value" });
      continue;
    }
    const words = renderTemplate(tpl.body_preview, params);
    const sent = await SENDERS.whatsapp(ctx, c.phone_e164, { body: words, template: { name: b.template_name, language: b.template_language, params } });
    const messageId = await recordOutbound(ctx.db, {
      tenantId: job.tenant_id,
      conversationId: target.conversationId,
      contactId: c.id,
      sender: "human",
      type: "template",
      body: words,
      externalId: sent.ok ? sent.wamid : null,
      status: sent.ok ? "sent" : "failed",
      // A run's message names its playbook, so a thread reads "by the Win-back playbook".
      meta: {
        source: "broadcast",
        broadcast_id: b.id,
        broadcast_name: b.name,
        ...b.playbook_id ? { playbook_id: b.playbook_id, playbook_name: String(b.audience?.label ?? b.name) } : {},
        ...sent.ok ? {} : { http_status: sent.status }
      }
    }).catch((e) => {
      console.error("broadcast_record_failed", e instanceof Error ? e.message : e);
      return null;
    });
    if (sent.ok) {
      await mark(r.contact_id, { state: "sent", message_id: messageId });
      await ctx.db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", target.conversationId);
    } else {
      await mark(r.contact_id, { state: "failed", reason: "send_failed", message_id: messageId });
    }
    if (BROADCAST_GAP_MS > 0) await new Promise((res) => setTimeout(res, BROADCAST_GAP_MS));
  }
  const { count: remaining, error: rErr } = await ctx.db.from("broadcast_recipients").select("contact_id", { count: "exact", head: true }).eq("broadcast_id", b.id).eq("state", "queued");
  if (rErr) throw new Error(`broadcast_send: cannot count the rest: ${rErr.message}`);
  if ((remaining ?? 0) > 0) {
    const { data: still } = await ctx.db.from("broadcasts").select("state").eq("id", b.id).maybeSingle();
    if (still?.state !== "sending") return;
    if (!ctx.schedule) throw new Error("broadcast_send: this runner cannot schedule the next batch");
    await ctx.schedule("broadcast_send", /* @__PURE__ */ new Date(), { broadcast_id: b.id });
    return;
  }
  const { data: tally } = await ctx.db.from("broadcast_recipients").select("state").eq("broadcast_id", b.id);
  const sentN = (tally ?? []).filter((t) => t.state === "sent").length;
  const held = (tally ?? []).length - sentN;
  await ctx.db.from("broadcasts").update({ state: "sent", finished_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", b.id).eq("state", "sending");
  await ctx.db.from("events").insert({
    tenant_id: job.tenant_id,
    kind: "broadcast.sent",
    category: "message",
    subject_type: "broadcast",
    subject_id: b.id,
    data: { sent: sentN, held }
  });
  await ctx.alert(
    `Broadcast \u201C${b.name}\u201D sent`,
    `${sentN} ${sentN === 1 ? "person" : "people"} got it${held ? `; ${held} held back (no recorded yes, asked to stop, no number, or a person had the thread)` : ""}. Replies land in the Inbox.`
  );
}
var HANDLERS = {
  outbound_send: outboundSend,
  broadcast_send: broadcastSend,
  pause_expire: pauseExpire,
  snooze_wake: snoozeWake,
  blob_thread_erase: blobThreadErase
};
async function dispatchJob(ctx, job) {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
export {
  FIRE_URL,
  cancelJob,
  cancelJobsFor,
  dispatchJob,
  scheduleJob,
  upsertEscalation
};
