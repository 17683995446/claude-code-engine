export type ToolInput = {
  name: string
  schema: Record<string, unknown>
}

export type ToolOutput = {
  success: boolean
  result: string
}
