export type AuthToken = {
  source: string
  token: string
  expires_at: number
}

export type AuthStatus = {
  is_authenticated: boolean
  source: string
}
