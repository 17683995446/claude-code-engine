/**
 * Abstract base class for all business classes.
 *
 * All business classes must extend this base.
 * Abstract methods must be implemented by subclasses.
 */
export abstract class AbcBase {
  /**
   * Validate the internal state of the instance.
   *
   * @returns True if valid, otherwise false.
   */
  abstract validate(): boolean

  /**
   * Convert the instance to a plain object representation.
   *
   * @returns The plain object.
   */
  abstract to_object(): Record<string, unknown>
}
