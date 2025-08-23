export class AudioManager {
    static setVolume(player, volume) {
        if (player && typeof player.setVolume === 'function') {
            player.setVolume(volume);
        }
    }
    
    static fadeVolume(player, fromVol, toVol, duration = 1000) {
        // Implementar fade gradual
    }
    
    static syncVolumes() {
        // Sincronizar volúmenes entre players
    }
}
