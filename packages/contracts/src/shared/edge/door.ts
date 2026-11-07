/**
 * A door on the edge, declared once for both deploys: the path a call's token is minted for, and the body the door takes.
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
import { UUID } from "../identity";

/** A door's path on the edge. */
export type DoorPath = `/api/${string}`;

/** A door, declared: its path, and what it takes (`null` for a door read with GET, which takes no body). */
export interface EdgeDoor<A extends DoorPath = DoorPath, S extends z.ZodType = z.ZodType> {
  readonly aud: A;
  readonly body: S;
}

/** A door, declared. */
export const edgeDoor = <A extends DoorPath, S extends z.ZodType>(aud: A, body: S): EdgeDoor<A, S> =>
  Object.freeze({ aud, body });

/** What a caller sends a door. */
export type DoorBody<D extends EdgeDoor> = z.input<D["body"]>;

/**
 * What a door reads: each field as its schema says, every one of them possibly absent, since a door still reads a body
 * its schema would refuse. Absent, not undefined: JSON drops undefined, so an op's own exact optional fields take it.
 */
export type DoorRead<D extends EdgeDoor> = {
  [K in keyof z.output<D["body"]>]?: Exclude<z.output<D["body"]>[K], undefined>;
};

/** An id a door reads as a row's: the shape every door checks one against (UUID). */
export const DOOR_ID = z.string().regex(UUID);

/** The body of a door read with GET: none. */
export const NO_BODY = z.null();
