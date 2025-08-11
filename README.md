# YT CrossMix - Arquitectura Modular

## Descripción

Este proyecto ha sido reestructurado desde un archivo `app.js` monolítico a una arquitectura modular con múltiples archivos especializados, manteniendo `app.js` como el controlador principal.

## Estructura de Archivos

```
/
├── app.js                 # Controlador principal
├── config.js             # Configuración y variables globales
├── youtubeAPI.js         # Manejo del API de YouTube
├── playlistManager.js    # Gestión de playlists
├── searchManager.js      # Manejo de búsqueda
├── playbackController.js # Control de reproducción y crossfade
├── sponsorblock.js       # Integración con SponsorBlock
├── ui.js                 # Manejo de interfaz de usuario
├── utils.js              # Utilidades y funciones auxiliares
└── index.html            # Archivo HTML de ejemplo
```

## Módulos Principales

### 1. **config.js**
- Configuración global de la aplicación
- Variables de estado compartidas
- Constantes de configuración (duración de crossfade, instancias de Piped, etc.)

### 2. **app.js (Controlador Principal)**
- Inicialización de la aplicación
- Coordinación entre módulos
- Manejo de eventos globales
- Referencias globales para compatibilidad

### 3. **youtubeAPI.js**
- Carga del API de YouTube
- Inicialización de reproductores
- Manejo de eventos de reproductores
- Estados de reproducción

### 4. **playlistManager.js**
- Gestión de playlists (crear, editar, eliminar)
- Lista aplanada para reproducción
- Manejo de videos (añadir, mover, eliminar)
- Integración con biblioteca de YouTube

### 5. **searchManager.js**
- Búsqueda de videos via Piped API
- Scroll infinito
- Manejo de resultados de búsqueda
- Debounce de búsquedas

### 6. **playbackController.js**
- Control de reproducción (play, pause, next)
- Crossfade entre reproductores
- Monitoreo de reproductores
- Transiciones de audio/video

### 7. **sponsorblock.js**
- Integración con SponsorBlock API
- Detección y salto de segmentos
- Caché de segmentos
- Manejo de segmentos "outro"

### 8. **ui.js**
- Renderizado de interfaz de usuario
- Manejo de menús contextuales
- Drag & Drop
- Mensajes flotantes

### 9. **utils.js**
- Funciones auxiliares reutilizables
- Formateo de datos
- Validaciones
- Utilidades de red y DOM

## Implementación

### Paso 1: Preparar los archivos
1. Crea todos los archivos `.js` listados arriba
2. Copia el contenido de cada módulo en su archivo correspondiente
3. Asegúrate de que tu servidor web soporte módulos ES6

### Paso 2: Actualizar tu HTML existente
```html
<!-- Reemplaza la importación del app.js monolítico con: -->
<script type="module">
    import './app.js';
</script>
```

### Paso 3: Verificar dependencias
- Font Awesome para iconos
- API de YouTube (se carga automáticamente)
- Tu CSS existente
- Netlify Functions (para búsqueda y SponsorBlock)

### Paso 4: Configuración
Edita `config.js` para ajustar:
- `CROSSFADE_DURATION`: Duración del crossfade en segundos
- `PIPED_INSTANCES`: Instancias de Piped API a usar
- Otros parámetros según tus necesidades

## Beneficios de la Modularización

### ✅ **Mantenibilidad**
- Cada módulo tiene una responsabilidad específica
- Fácil localización y corrección de errores
- Código más legible y organizado

### ✅ **Escalabilidad**
- Fácil añadir nuevas características
- Módulos independientes y reutilizables
- Mejor separación de responsabilidades

### ✅ **Desarrollo Colaborativo**
- Múltiples desarrolladores pueden trabajar en paralelo
- Menor riesgo de conflictos en el código
- Componentes bien definidos

### ✅ **Testing**
- Cada módulo se puede testear independientemente
- Mocking más sencillo
- Mejor cobertura de tests

### ✅ **Performance**
- Carga bajo demanda (tree shaking)
- Mejor gestión de memoria
- Caché más eficiente

## API Pública

### Instancia Principal
```javascript
// Acceder a la aplicación
const app = window.YTCrossMixApp;

// Obtener estadísticas
const stats = app.getStats();

// Reiniciar aplicación
app.reset();

// Debug info
app.debug();
```

### Funciones Globales Disponibles
```javascript
// Mostrar mensaje flotante
window.mostrarMensajeFlotante("Tu mensaje");

// Acceder a estados globales
window.appState
window.playlistState
window.searchState
window.sponsorBlockState
```

## Compatibilidad

### Retrocompatibilidad
- Las funciones existentes siguen funcionando
- Los event listeners de HTML no cambian
- El comportamiento de usuario es idéntico

### Navegadores Soportados
- Chrome 61+
- Firefox 60+
- Safari 10.1+
- Edge 16+

## Migración desde Versión Monolítica

### Si tienes el app.js original:
1. Reemplaza el archivo único con los módulos
2. Actualiza la importación en HTML
3. Verifica que las funciones Netlify siguen funcionando
4. Prueba todas las funcionalidades

### Cambios en el HTML:
- Cambiar `<script src="app.js">` por `<script type="module" src="app.js">`
- No se requieren otros cambios

## Desarrollo y Debug

### Herramientas de Debug
```javascript
// Ver estado completo
window.YTCrossMixApp.debug();

// Estadísticas en tiempo real
setInterval(() => {
    console.log(window.YTCrossMixApp.getStats());
}, 5000);

// Acceso a módulos individuales (en desarrollo)
import { PlaylistManager } from './playlistManager.js';
```

### Logs de Consola
Cada módulo incluye logs detallados para facilitar el debugging:
- `[PlaylistManager]`: Operaciones de playlist
- `[SearchManager]`: Búsquedas y resultados
- `[PlaybackController]`: Reproducción y crossfade
- `[SponsorBlock]`: Segmentos y saltos
- `[UIManager]`: Actualizaciones de interfaz

## Contribución

### Añadir Nueva Funcionalidad
1. Crear nuevo módulo si es necesario
2. Importar en `app.js` si requiere inicialización
3. Exportar funciones públicas
4. Documentar cambios en este README

### Estilo de Código
- Usar ES6+ modules
- Clases estáticas para namespacing
- JSDoc para funciones públicas
- Console.log descriptivo con prefijos de módulo

## Resolución de Problemas

### Error: "Cannot use import statement outside a module"
- Asegúrate de usar `<script type="module">`
- Verifica que tu servidor web soporte módulos ES6

### Error: "Module not found"
- Verifica las rutas de importación
- Asegúrate de que todos los archivos estén en el directorio correcto

### Crossfade no funciona
- Verifica `playbackController.js`
- Revisa la configuración en `config.js`

### SponsorBlock no responde
- Verifica la función Netlify para `/api/segments/`
- Revisa `sponsorblock.js` para errores de API

## Licencia

Mantiene la misma licencia del proyecto original.
