L.WaterShaderLayer = L.Layer.extend({
    onAdd: function (map) {
        this._map = map;
        
        // Create an absolute positioned canvas overlay on the main map container
        // This ensures the canvas matches screen resolution and doesn't pan physically.
        // The shader itself will handle the panning by recalculating point coordinates.
        this._canvas = L.DomUtil.create('canvas', 'leaflet-water-shader-layer');
        this._canvas.style.pointerEvents = 'none'; // Allow clicking through to map/tooltips
        
        var size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        
        // Append to overlayPane to ensure proper Leaflet z-index stacking (above tilePane, below tooltips)
        this._map.getPanes().overlayPane.appendChild(this._canvas);
        
        this.locations = [];
        
        this._initWebGL();
        
        this._map.on('resize', this._resize, this);
        this._map.on('move', this._resetCanvasPosition, this);
        
        this._resetCanvasPosition();
        
        // Start render loop
        this._lastTime = performance.now();
        this._animFrame = requestAnimationFrame(this._render.bind(this));
    },
    
    onRemove: function (map) {
        this._map.getPanes().overlayPane.removeChild(this._canvas);
        this._map.off('resize', this._resize, this);
        this._map.off('move', this._resetCanvasPosition, this);
        cancelAnimationFrame(this._animFrame);
    },
    
    setLocations: function (locs) {
        this.locations = locs;
    },
    
    _resize: function (e) {
        var size = e.newSize;
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._resetCanvasPosition();
    },
    
    _resetCanvasPosition: function() {
        // Counter-act Leaflet's pane panning by translating the canvas back to the screen's [0,0]
        var topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
    },
    
    _initWebGL: function () {
        const gl = this._canvas.getContext('webgl');
        if (!gl) {
            console.error("WebGL not supported");
            return;
        }
        this.gl = gl;
        
        const vsSource = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;
        
        const fsSource = `
            precision highp float;
            uniform vec2 u_resolution;
            uniform float u_time;
            
            // Limit to 150 active ripples to maintain performance
            uniform vec3 u_Drops[150]; // x, y, intensity
            uniform int u_DropCount;

            void main() {
                vec2 st = gl_FragCoord.xy;
                st.y = u_resolution.y - st.y; // Flip Y axis to match screen coordinates
                
                float totalGlow = 0.0;
                
                for(int i = 0; i < 150; i++) {
                    if(i >= u_DropCount) break;
                    
                    vec2 dropPos = u_Drops[i].xy;
                    float intensity = u_Drops[i].z; // 1.0 = new, 0.0 = old/faded
                    
                    float dist = distance(st, dropPos);
                    
                    // Continuous expanding wave math based on u_time
                    float wavePhase = dist * 0.05 - u_time * 4.0;
                    float wave = sin(wavePhase);
                    
                    // Smooth the sine wave into a sharp crest
                    float ring = smoothstep(0.8, 1.0, wave);
                    
                    // Mask it so the ripples fade out smoothly at the edges (radius 120px)
                    float mask = 1.0 - smoothstep(0.0, 120.0, dist);
                    
                    // Solid core that pulses
                    float core = (1.0 - smoothstep(0.0, 5.0, dist)) * (0.5 + 0.5 * sin(u_time * 8.0));
                    ring += core;
                    
                    // Fade out exponentially based on intensity
                    ring *= mask * (intensity * intensity);
                    
                    totalGlow += ring;
                }
                
                // Color mapping: Neon Cyan to Deep Purple
                vec3 cyan = vec3(0.0, 0.8, 1.0);
                vec3 purple = vec3(0.6, 0.2, 1.0);
                
                // Mix color based on overlapping intensity
                vec3 finalColor = mix(cyan, purple, clamp(totalGlow * 0.3, 0.0, 1.0));
                
                // Premultiply alpha
                gl_FragColor = vec4(finalColor * totalGlow, clamp(totalGlow * 0.9, 0.0, 1.0));
            }
        `;
        
        const vertexShader = this._compileShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this._compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);
        this.program = program;
        
        // Full screen quad geometry
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0
        ]), gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        this.uResolution = gl.getUniformLocation(program, "u_resolution");
        this.uTime = gl.getUniformLocation(program, "u_time");
        this.uDropCount = gl.getUniformLocation(program, "u_DropCount");
        
        // Pre-fetch uniform array locations for performance
        this.uDrops = [];
        for(let i = 0; i < 150; i++) {
            this.uDrops.push(gl.getUniformLocation(program, "u_Drops[" + i + "]"));
        }
        
        // Enable additive blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // Additive blending for glowing effect
    },
    
    _compileShader: function(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    },
    
    _render: function (now) {
        const gl = this.gl;
        if (!gl) return;
        
        const width = this._canvas.width;
        const height = this._canvas.height;
        
        gl.viewport(0, 0, width, height);
        gl.clearColor(0.0, 0.0, 0.0, 0.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.uniform2f(this.uResolution, width, height);
        gl.uniform1f(this.uTime, now * 0.001);
        
        // Only pass up to 150 locations to the shader
        let dropCount = Math.min(this.locations.length, 150);
        gl.uniform1i(this.uDropCount, dropCount);
        
        for(let i = 0; i < dropCount; i++) {
            let loc = this.locations[i];
            // Translate geographic lat/lng directly into screen space pixels!
            let pt = this._map.latLngToContainerPoint([loc.lat, loc.lng]);
            gl.uniform3f(this.uDrops[i], pt.x, pt.y, loc.intensity);
        }
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Queue next frame
        this._animFrame = requestAnimationFrame(this._render.bind(this));
    }
});

L.waterShaderLayer = function (options) {
    return new L.WaterShaderLayer(options);
};
