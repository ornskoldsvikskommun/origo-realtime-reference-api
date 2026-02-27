export default class ConnectionManager {
    constructor() {
        this.clients = new Set();
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`Client added. Total clients: ${this.clients.size}`);
    }

    removeClient(ws) {
        this.clients.delete(ws);
        console.log(`Client removed. Total clients: ${this.clients.size}`);
    }

    broadcast(message, sender = null) {
        this.clients.forEach(client => {
            if (client !== sender && client.readyState === client.OPEN) {
                try {
                    client.send(message);
                } catch (error) {
                    console.error('Error broadcasting to client:', error);
                    this.removeClient(client);
                }
            }
        });
    }

    getClientCount() {
        return this.clients.size;
    }
}
