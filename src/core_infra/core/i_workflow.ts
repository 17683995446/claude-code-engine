/**
 * Workflow engine interface.
 *
 * Defines the contract for DAG task orchestration.
 */
export interface IWorkflowEngine {
  /**
   * Define a task in the workflow.
   *
   * @param id - The task identifier.
   * @param deps - The dependency task ids.
   * @param action - The action name.
   */
  define_task(id: string, deps: string[], action: string): void

  /**
   * Execute the workflow.
   *
   * @returns The executed task ids in order.
   */
  execute(): string[]

  /**
   * Get the status of a task.
   *
   * @param id - The task identifier.
   * @returns The status string.
   */
  get_status(id: string): string
}
