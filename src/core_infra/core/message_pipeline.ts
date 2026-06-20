import type { Message } from "./message_types.js"
import { log_info } from "../infra/global_logger.js"
import type { IMessagePipeline } from "./i_message_pipeline.js"

export class MessagePipeline implements IMessagePipeline {
  create(
    id: string,
    content: string,
    role: "user" | "assistant" | "system",
  ): Message {
    log_info(`message_pipeline_create: id=${id}, role=${role}`)
    return {
      id,
      content,
      role,
      timestamp: Date.now(),
    }
  }

  normalize(message: Message): Message {
    log_info(`message_pipeline_normalize: id=${message.id}`)
    return {
      ...message,
      content: message.content.trim(),
    }
  }
}

export function create_message(
  id: string,
  content: string,
  role: "user" | "assistant" | "system",
): Message {
  log_info(`create_message_compat: id=${id}`)
  const pipeline = new MessagePipeline()
  return pipeline.create(id, content, role)
}

export function normalize_message(message: Message): Message {
  log_info(`normalize_message_compat: id=${message.id}`)
  const pipeline = new MessagePipeline()
  return pipeline.normalize(message)
}
