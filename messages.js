// messages.js - NUEVO ARCHIVO INDEPENDIENTE
// Rompe las dependencias circulares moviendo mostrarMensajeFlotante aquí

export function mostrarMensajeFlotante(mensaje, duracion = 4000, tipo = 'info') {
    if (!mensaje) {
        console.warn('⚠️ Mensaje vacío enviado a mostrarMensajeFlotante');
        return;
    }
    
    console.log('💬 Mensaje flotante:', mensaje);
    
    // Crear elemento del mensaje
    const mensajeDiv = document.createElement('div');
    mensajeDiv.textContent = mensaje;
    mensajeDiv.className = 'floating-message';
    
    // Buscar contenedor apropiado o usar body
    const container = document.getElementById('floatingMessageContainer') || 
                     document.querySelector('.mobile-main') || 
                     document.body;
    
    container.appendChild(mensajeDiv);

    // Estilos optimizados según tipo
    const baseStyles = {
        position: 'fixed',
        bottom: 'calc(64px + 64px + 20px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%) translateY(100px) scale(0.8)',
        zIndex: '10001',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '12px',
        fontSize: '13px',
        fontWeight: '500',
        maxWidth: 'calc(100vw - 32px)',
        wordWrap: 'break-word',
        textAlign: 'center',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3), 0 6px 20px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        willChange: 'transform, opacity',
        pointerEvents: 'none'
    };

    // Colores según tipo
    const typeColors = {
        info: 'linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(26, 26, 26, 0.9))',
        success: 'linear-gradient(135deg, rgba(76, 175, 80, 0.9), rgba(56, 142, 60, 0.9))',
        error: 'linear-gradient(135deg, rgba(244, 67, 54, 0.9), rgba(211, 47, 47, 0.9))',
        warning: 'linear-gradient(135deg, rgba(255, 193, 7, 0.9), rgba(245, 124, 0, 0.9))'
    };

    Object.assign(mensajeDiv.style, {
        ...baseStyles,
        background: typeColors[tipo] || typeColors.info
    });

    // Animación de entrada
    requestAnimationFrame(() => {
        Object.assign(mensajeDiv.style, {
            transform: 'translateX(-50%) translateY(0) scale(1)',
            opacity: '1'
        });
    });

    // Auto-remove con animación de salida
    setTimeout(() => {
        Object.assign(mensajeDiv.style, {
            transform: 'translateX(-50%) translateY(-20px) scale(0.9)',
            opacity: '0'
        });
        
        setTimeout(() => {
            if (mensajeDiv.parentNode) {
                mensajeDiv.remove();
            }
        }, 400);
    }, duracion);

    // Permitir click para cerrar antes
    mensajeDiv.addEventListener('click', () => {
        mensajeDiv.style.opacity = '0';
        setTimeout(() => {
            if (mensajeDiv.parentNode) {
                mensajeDiv.remove();
            }
        }, 200);
    });
}

// Funciones de loading independientes
export function showLoadingSpinner() {
    let spinner = document.getElementById('loadingSpinner');
    if (!spinner) {
        spinner = document.createElement('div');
        spinner.id = 'loadingSpinner';
        spinner.className = 'loading-spinner';
        spinner.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(spinner);
    }
    spinner.classList.remove('hidden');
    spinner.style.display = 'flex';
    console.log('✨ Loading spinner mostrado');
}

export function hideLoadingSpinner() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) {
        spinner.classList.add('hidden');
        setTimeout(() => {
            spinner.style.display = 'none';
        }, 300);
    }
    console.log('✨ Loading spinner ocultado');
}