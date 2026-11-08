/**
 * A door on the edge, declared once for both deploys: the path a call's token is minted for, the body the door takes, and
 * what the dashboard reads of what it answers.
 *
 * The dashboard and the edge deploy apart, and what one sends the other had no shape either could check: the dashboard
 * wrote each door's path as a string and its body as an object of its own, and the edge read the body as `Partial<T>` of
 * a type it kept to itself. A field renamed on one side reached the other as nothing, and only a person pressing the
 * button found out. Now each domain declares its doors beside its other contracts (`<domain>/edge-doors.ts`): the
 * dashboard's `callEdge` takes a declared path and that door's body, and the door reads the body through the same schema
 * (apps/edge/lib/shared/admin-door.ts `readBody`).
 *
 * The door reports a body its schema does not hold, by field and never by value, and goes on as it always did; its op
 * still refuses what it refuses, in its own words. It refuses at the schema once production has sent nothing the
 * schema refuses (decision 0109). Either deploy order works: a field is added as optional, and a door keeps reading
 * one the other side may not send yet.
 */
import { z } from "zod";
import type { EdgeAnswerBody } from "../edge-errors";
import { UUID } from "../identity";

/** A door's path on the edge. */
export type DoorPath = `/api/${string}`;

/**
 * A door, declared: its path, what it takes (`null` for a door read with GET, which takes no body), and what the dashboard
 * reads of its answer (`answerFields`).
 */
export interface EdgeDoor<
  A extends DoorPath = DoorPath,
  S extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  readonly aud: A;
  readonly body: S;
  readonly answer: R;
}

/** A door, declared. */
export const edgeDoor = <A extends DoorPath, S extends z.ZodType, R extends z.ZodType>(
  aud: A,
  body: S,
  answer: R,
): EdgeDoor<A, S, R> => Object.freeze({ aud, body, answer });

/** What a caller sends a door. */
export type DoorBody<D extends EdgeDoor> = z.input<D["body"]>;

/**
 * What a door reads: each field as its schema says, every one of them possibly absent, since a door still reads a body
 * its schema would refuse. Absent, not undefined: JSON drops undefined, so an op's own exact optional fields take it.
 */
export type DoorRead<D extends EdgeDoor> = {
  [K in keyof z.output<D["body"]>]?: Exclude<z.output<D["body"]>[K], undefined>;
};

/**
 * What the dashboard reads of a door's answer. Every field may be absent, since a refusal says none of them, and a field
 * nobody reads is not declared: the schema holds what is read, not all the door says.
 */
export const answerFields = <F extends z.ZodRawShape>(fields: F) => z.object(fields).partial();

/** The answer of a door the dashboard reads only for whether it worked: `ok`, `error` and `detail`, which every answer may say. */
export const PLAIN_ANSWER = answerFields({});

/** A field whose shape a contracts type names and no schema does yet: held to being an object or a list, read as that type. */
export const shaped = <T extends object>() => z.custom<T>((value) => typeof value === "object" && value !== null);

/** What a caller reads of a door's answer: each field as its schema says, absent and never undefined, as JSON drops it. */
export type DoorAnswer<D extends EdgeDoor> = EdgeAnswerBody & {
  [K in keyof z.output<D["answer"]>]?: Exclude<z.output<D["answer"]>[K], undefined>;
};

/** The fields a body or an answer its door's schema did not hold, at most ten, each once: what a line says instead of the value. */
export const unheldByDoor = (error: z.ZodError): string[] =>
  [...new Set(error.issues.map((issue) => issue.path.map(String).join(".") || "(body)"))].sort().slice(0, 10);

/** An id a door reads as a row's: the shape every door checks one against (UUID). */
export const DOOR_ID = z.string().regex(UUID);

/** The body of a door read with GET: none. */
export const NO_BODY = z.null();
