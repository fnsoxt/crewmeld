import { setupConnectionHandlers } from '@/socket/handlers/connection'
import type { AuthenticatedSocket } from '@/socket/middleware/auth'
import type { IRoomManager } from '@/socket/rooms'

export function setupAllHandlers(socket: AuthenticatedSocket, roomManager: IRoomManager) {
  setupConnectionHandlers(socket, roomManager)
}
