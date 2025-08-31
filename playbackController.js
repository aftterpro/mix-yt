// ===== 4. PLAYBACKCONTROLLER.JS - MODIFICADO PARA SISTEMA UNIFICADO =====
// ✅ ELIMINAR duplicados y delegar al core unificado
export class PlaybackController {
    // Mantener solo métodos específicos que no están en el core
    // El resto delegará al unifiedCore.playbackController
    
    static playFirstVideo() {
        return window.unifiedCore?.playbackController?.playFirstVideo();
    }
    
    static playNextVideo() {
        return window.unifiedCore?.playbackController?.playNextVideo();
    }
    
    static startMonitoring() {
        return window.unifiedCore?.playbackController?.startMonitoring();
    }
    
    static stopMonitoring() {
        return window.unifiedCore?.playbackController?.stopMonitoring();
    }
}
