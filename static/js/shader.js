L.WaterShaderLayer = L.Layer.extend({
    onAdd: function (map) {
        this._map = map;
        
        // Create an absolute positioned canvas overlay on the main map container
        // This ensures the canvas matches screen resolution and doesn't pan physically.
        // The shader itself will handle the panning by recalculating point coordinates.
        this._canvas = L.DomUtil.create('canvas', 'leaflet-water-shader-layer');
        this._canvas.style.position = 'absolute';
        this._canvas.style.top = 0;
        this._canvas.style.left = 0;
        this._canvas.style.pointerEvents = 'none'; // Allow clicking through to map/tooltips
        this._canvas.style.zIndex = 350; // Above tilePane, below tooltips
        
        var size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        
        this._map.getContainer().appendChild(this._canvas);
        
        this.locations = [];
        
        this._initWebGL();
        
        this._map.on('resize', this._resize, this);
        
        // Start render loop
        this._lastTime = performance.now();
        this._animFrame = requestAnimationFrame(this._render.bind(this));
    },
    
    onRemove: function (map) {
        this._map.getContainer().removeChild(this._canvas);
        this._map.off('resize', this._resize, this);
        cancelAnimationFrame(this._animFrame);
    },
    
    setLocations: function (locs) {
        this.locations = locs;
    },
    
    _resize: function (e) {
        var size = e.newSize;
        this._canvas.width = size.x;
        this._canvas.height = size.y;
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
                    
                    float age = 1.0 - intensity; 
                    float radius = age * 120.0; // Riple expands up to 120px
                    
                    // Primary expanding ring
                    float ring = 1.0 - smoothstep(0.0, 3.0, abs(dist - radius));
                    
                    // Secondary inner echo ring for water ripple feel
                    float innerRing = 1.0 - smoothstep(0.0, 2.0, abs(dist - radius * 0.7));
                    ring += innerRing * 0.4;
                    
                    // Solid core when it first drops
                    float core = (1.0 - smoothstep(0.0, 10.0, dist)) * (intensity * 2.0);
                    ring += core;
                    
                    // Fade out exponentially based on intensity
                    ring *= intensity * intensity * intensity;
                    
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
