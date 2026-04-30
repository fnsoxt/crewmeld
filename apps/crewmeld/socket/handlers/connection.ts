import { createLogger } from '@crewmeld/logger'
import type { AuthenticatedSocket } from '@/socket/middleware/auth'
import type { IRoomManager } from '@/socket/rooms'

const logger = createLogger('ConnectionHandlers')

export function setupConnectionHandlers(socket: AuthenticatedSocket, _roomManager: IRoomManager) {
  socket.on('error', (error) => {
    logger.error(`Socket ${socket.id} error:`, error)
  })

  socket.conn.on('error', (error) => {
    logger.error(`Socket ${socket.id} connection error:`, error)
  })

  socket.on('disconnect', (reason) => {
    logger.info(`Socket ${socket.id} disconnected (reason: ${reason})`)
  })
}
