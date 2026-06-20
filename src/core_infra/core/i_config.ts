/**
 * Configuration loader interface.
 */
export interface IConfigLoader {
  /**
   * Load configuration from a file path.
   *
   * @param file_path - The path to the config file.
   * @returns The parsed configuration.
   * @throws ConfigException if loading fails.
   */
  load(file_path: string): Record<string, unknown>
}

/**
 * Configuration validator interface.
 */
export interface IConfigValidator {
  /**
   * Validate that a value is present.
   *
   * @param value - The value to check.
   * @param key - The configuration key.
   * @throws ValidationException if missing.
   */
  validate_present(value: unknown, key: string): void

  /**
   * Validate that a value is a string.
   *
   * @param value - The value to check.
   * @param key - The configuration key.
   * @throws ValidationException if not a string.
   */
  validate_string(value: unknown, key: string): void

  /**
   * Validate that a number is within range.
   *
   * @param value - The number to check.
   * @param key - The configuration key.
   * @param min - The minimum value.
   * @param max - The maximum value.
   * @throws ValidationException if out of range.
   */
  validate_range(value: number, key: string, min: number, max: number): void
}
