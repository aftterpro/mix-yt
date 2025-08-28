// ===== MESSAGES.JS - SISTEMA DE MENSAJES UNIFICADO =====
// Sistema de mensajes que integra con el core unificado

// ===== FUNCIÓN PRINCIPAL COMPATIBLE =====
export function mostrarMensajeFlotante(mensaje, duracion = 3000, tipo = 'info') {
    console.log(`💬 Mensaje legacy interceptado: [${tipo}] ${mensaje}`);
    
    // Redirigir al sistema unificado si está disponible
    if (window.unifiedMessageManager) {
        return window.unifiedMessageManager.show(mensaje, tipo, duracion);
    }
    
    // Fallback si el sistema unificado no está listo
    console.warn('⚠️ Sistema unificado no disponible, usando fallback temporal');
    return showFallbackMessage(mensaje, tipo, duracion);
}

// ===== FALLBACK TEMPORAL =====
function showFallbackMessage(mensaje, tipo, duracion) {
    const messageId = `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const messageEl = document.createElement('div');
    messageEl.id = messageId;
    messageEl.className = 'floating-message fallback-message';
    messageEl.textContent = mensaje;
    
    // Estilos base
    Object.assign(messageEl.style, {
        position: 'fixed',
        bottom: 'calc(64px + 80px + env(safe-area-inset-bottom, 0px) + 20px)',
        left: '50%',
        transform: 'translateX(-50%) translateY(100px) scale(0.8)',
        zIndex: '10001',
        background: getBackgroundForType(tipo),
        color: 'white',
        padding: '12px 20px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '500',
        maxWidth: 'calc(100vw - 32px)',
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        cursor: 'pointer'
    });
    
    document.body.appendChild(messageEl);
    
    // Animación de entrada
    requestAnimationFrame(() => {
        messageEl.style.opacity = '1';
        messageEl.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    });
    
    // Auto-remove
    setTimeout(() => {
        hideFallbackMessage(messageEl);
    }, duracion);
    
    // Click to dismiss
    messageEl.addEventListener('click', () => {
        hideFallbackMessage(messageEl);
    });
    
    console.log(`📱 Mensaje fallback mostrado: ${messageId}`);
    return messageEl;
}

function hideFallbackMessage(messageEl) {
    if (!messageEl || !messageEl.parentNode) return;
    
    messageEl.style.opacity = '0';
    messageEl.style.transform = 'translateX(-50%) translateY(-20px) scale(0.9)';
    
    setTimeout(() => {
        if (messageEl.parentNode) {
            messageEl.remove();
        }
    }, 400);
}

function getBackgroundForType(tipo) {
    const backgrounds = {
        'info': 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
        'success': 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9))',
        'error': 'linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(211, 47, 47, 0.9))',
        'warning': 'linear-gradient(135deg, rgba(255, 193, 7, 0.9), rgba(245, 124, 0, 0.9))'
    };
    
    return backgrounds[tipo] || backgrounds.info;
}

// ===== MIGRACIÓN AL SISTEMA UNIFICADO =====
class MessageSystemMigrator {
    static migrate() {
        console.log('🔄 Migrando sistema de mensajes legacy...');
        
        // Override función global si existe
        if (window.mostrarMensajeFlotante) {
            const originalFunction = window.mostrarMensajeFlotante;
            
            window.mostrarMensajeFlotante = function(mensaje, duracion, tipo) {
                console.log('🔄 Legacy message intercepted, redirecting to unified system');
                
                if (window.unifiedMessageManager) {
                    return window.unifiedMessageManager.show(mensaje, tipo || 'info', duracion || 3000);
                } else {
                    console.warn('⚠️ Unified system not ready, using original function');
                    return originalFunction.call(this, mensaje, duracion, tipo);
                }
            };
            
            console.log('✅ Función legacy interceptada y redirigida');
        }
        
        // Setup global reference
        window.mostrarMensajeFlotante = mostrarMensajeFlotante;
        
        console.log('✅ Migración del sistema de mensajes completada');
    }
    
    static checkMigrationStatus() {
        return {
            unifiedManagerAvailable: !!window.unifiedMessageManager,
            legacyFunctionOverridden: window.mostrarMensajeFlotante === mostrarMensajeFlotante,
            fallbackReady: typeof showFallbackMessage === 'function'
        };
    }
}

// ===== VERIFICACIÓN DE COMPATIBILIDAD =====
function verifyMessageSystem() {
    const checks = {
        unifiedManager: !!window.unifiedMessageManager,
        legacyFunction: typeof window.mostrarMensajeFlotante === 'function',
        fallbackAvailable: typeof showFallbackMessage === 'function'
    };
    
    console.log('🔍 Verificación del sistema de mensajes:', checks);
    
    if (!checks.unifiedManager && !checks.fallbackAvailable) {
        console.error('💥 CRÍTICO: No hay sistema de mensajes disponible');
        return false;
    }
    
    return true;
}

// ===== TESTING UTILITIES =====
export function testMessageSystem() {
    console.log('🧪 Testing message system...');
    
    const messages = [
        { text: 'Test info message', type: 'info', duration: 2000 },
        { text: 'Test success message', type: 'success', duration: 2000 },
        { text: 'Test warning message', type: 'warning', duration: 2000 },
        { text: 'Test error message', type: 'error', duration: 2000 }
    ];
    
    messages.forEach((msg, index) => {
        setTimeout(() => {
            mostrarMensajeFlotante(msg.text, msg.duration, msg.type);
        }, index * 500);
    });
    
    console.log('✅ Message system test started');
}

// ===== AUTO-MIGRACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    // Migrar inmediatamente
    MessageSystemMigrator.migrate();
    
    // Verificar estado
    setTimeout(() => {
        const status = MessageSystemMigrator.checkMigrationStatus();
        console.log('📊 Estado de migración de mensajes:', status);
        
        if (!verifyMessageSystem()) {
            console.error('💥 Error crítico en sistema de mensajes');
        }
    }, 1000);
});

// Migrar cuando el sistema unificado esté listo
window.addEventListener('ytcrossmix:unified:ready', () => {
    console.log('🎉 Sistema unificado listo, re-migrando mensajes...');
    MessageSystemMigrator.migrate();
    
    // Test opcional en desarrollo
    if (window.location.hostname === 'localhost' || window.location.hostname.includes('127.0.0.1')) {
        setTimeout(() => {
            console.log('🧪 Testing unified message system...');
            mostrarMensajeFlotante('Sistema de mensajes unificado activo', 2000, 'success');
        }, 2000);
    }
});

// ===== EXPORTS =====
export { MessageSystemMigrator, verifyMessageSystem };
export default mostrarMensajeFlotante;

// ===== GLOBAL SETUP =====
window.mostrarMensajeFlotante = mostrarMensajeFlotante;
window.MessageSystemMigrator = MessageSystemMigrator;

console.log('✅ Sistema de mensajes unificado cargado');
