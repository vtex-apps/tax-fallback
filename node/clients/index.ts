import { IOClients } from '@vtex/api'

import Avalara from './avalara'

// Extend the default IOClients implementation with our own custom clients.
export class Clients extends IOClients {
  public get avalara() {
    return this.getOrSet('avalara', Avalara)
  }
}
