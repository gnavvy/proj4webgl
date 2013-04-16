(function() {

  define(['./script/proj4gl.js', './script/webgl-utils.js'], function(Proj4Gl) {
    var RasterLayer, createAndCompileShader;
    createAndCompileShader = function(gl, type, source) {
      var shader;
      shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Error compiling shader:');
        console.error(source);
        console.error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };
    RasterLayer = (function() {

      function RasterLayer(map, textureUrl) {
        var _this = this;
        this.map = map;
        this.textureUrl = textureUrl;
        this.gl = null;
        this.shaderProgram = null;
        this.texture = null;
        this.map.watch('gl', function(n, o, gl) {
          return _this.setGl(gl);
        });
        this.map.watch('projection', function(n, o, proj) {
          return _this.setProjection(proj);
        });
        this.setGl(this.map.gl);
      }

      RasterLayer.prototype.setGl = function(gl) {
        var _this = this;
        this.gl = gl;
        if (!(this.gl != null)) {
          return;
        }
        this.texture = this.gl.createTexture();
        this.texture.image = new Image();
        this.texture.image.onload = function() {
          return _this._textureLoaded();
        };
        this.texture.image.src = this.textureUrl;
        this.texture.loaded = false;
        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, -0.5, -0.5, 1, -1, 0, 0.5, -0.5, 1, 1, 0, 0.5, 0.5, -1, 1, 0, -0.5, 0.5]), this.gl.STATIC_DRAW);
        this.vertexBuffer.stride = 5 * 4;
        this.vertexBuffer.textureOffset = 3 * 4;
        this.vertexBuffer.textureSize = 2;
        this.vertexBuffer.positionOffset = 0 * 4;
        this.vertexBuffer.positionSize = 3;
        this.indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 3]), this.gl.STATIC_DRAW);
        this.indexBuffer.numItems = 4;
        return this.setProjection(this.map.projection);
      };

      RasterLayer.prototype.setProjection = function(proj) {
        var fragmentShader, paramDef, projSource, v, vertexShader, _, _i, _len, _ref, _ref1, _results;
        this.proj = proj;
        this.shaderProgram = null;
        if (!(this.proj != null)) {
          return;
        }
        projSource = Proj4Gl.projectionShaderSource(this.proj.projName);
        vertexShader = createAndCompileShader(this.gl, this.gl.VERTEX_SHADER, "attribute vec2 aTextureCoord;\nattribute vec3 aVertexPosition;\nvarying vec2 vTextureCoord;\n\nuniform vec2 uViewportSize; // in pixels\nuniform float uScale; // the size of one pixel in projection co-ords\nuniform vec2 uViewportProjectionCenter; // the center of the viewport in projection co-ords\n\nvoid main(void) {\n  vec3 pos = aVertexPosition;\n  gl_Position = vec4(pos, 1.0);\n\n  // convert texture coord in range [-0.5, 0.5) to viewport pixel coord\n  vec2 pixelCoord = aTextureCoord * uViewportSize;\n\n  // convert to projection coordinates\n  vTextureCoord = pixelCoord * uScale - uViewportProjectionCenter;\n}");
        fragmentShader = createAndCompileShader(this.gl, this.gl.FRAGMENT_SHADER, "precision mediump float;\n\n// define the projection and projection parameters structure\n" + projSource.source + "\n\nvarying vec2 vTextureCoord;\nuniform sampler2D uSampler;\nuniform " + projSource.paramsStruct.name + " uProjParams;\n\nvoid main(void) {\n  vec2 lonlat = " + projSource.backwardsFunction + "(vTextureCoord, uProjParams);\n  lonlat /= vec2(2.0 * 3.14159, 3.14159);\n  lonlat += vec2(0.5, 0.5);\n  gl_FragColor = texture2D(uSampler, lonlat);\n}");
        this.shaderProgram = this.gl.createProgram();
        this.gl.attachShader(this.shaderProgram, vertexShader);
        this.gl.attachShader(this.shaderProgram, fragmentShader);
        this.gl.linkProgram(this.shaderProgram);
        if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
          throw 'Could not initialise shaders';
        }
        this.shaderProgram.attributes = {
          vertexPosition: this.gl.getAttribLocation(this.shaderProgram, 'aVertexPosition'),
          textureCoord: this.gl.getAttribLocation(this.shaderProgram, 'aTextureCoord')
        };
        this.shaderProgram.uniforms = {
          sampler: this.gl.getUniformLocation(this.shaderProgram, 'uSampler'),
          viewportSize: this.gl.getUniformLocation(this.shaderProgram, 'uViewportSize'),
          scale: this.gl.getUniformLocation(this.shaderProgram, 'uScale'),
          viewportProjectionCenter: this.gl.getUniformLocation(this.shaderProgram, 'uViewportProjectionCenter'),
          projParams: {}
        };
        _ref = projSource.paramsStruct.params;
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          paramDef = _ref[_i];
          this.shaderProgram.uniforms.projParams[paramDef[0]] = {
            loc: this.gl.getUniformLocation(this.shaderProgram, 'uProjParams.' + paramDef[0]),
            type: paramDef[1]
          };
        }
        this.gl.useProgram(this.shaderProgram);
        _ref1 = this.shaderProgram.attributes;
        _results = [];
        for (_ in _ref1) {
          v = _ref1[_];
          _results.push(this.gl.enableVertexAttribArray(v));
        }
        return _results;
      };

      RasterLayer.prototype.drawLayer = function() {
        var k, v, _ref;
        if (!(this.shaderProgram != null) || !this.texture.loaded) {
          return;
        }
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(this.shaderProgram.attributes.vertexPosition, this.vertexBuffer.positionSize, this.gl.FLOAT, false, this.vertexBuffer.stride, this.vertexBuffer.positionOffset);
        this.gl.vertexAttribPointer(this.shaderProgram.attributes.textureCoord, this.vertexBuffer.textureSize, this.gl.FLOAT, false, this.vertexBuffer.stride, this.vertexBuffer.textureOffset);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.useProgram(this.shaderProgram);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.uniform1i(this.shaderProgram.uniforms.sampler, 0);
        this.gl.uniform2f(this.shaderProgram.uniforms.viewportSize, this.map.element.clientWidth, this.map.element.clientHeight);
        this.gl.uniform1f(this.shaderProgram.uniforms.scale, this.map.scale);
        this.gl.uniform2f(this.shaderProgram.uniforms.viewportProjectionCenter, this.map.center.x, this.map.center.y);
        _ref = this.shaderProgram.uniforms.projParams;
        for (k in _ref) {
          v = _ref[k];
          if (!(this.proj[k] != null)) {
            continue;
          }
          if (v.type === 'int') {
            this.gl.uniform1i(v.loc, this.proj[k]);
          } else if (v.type === 'float') {
            this.gl.uniform1f(v.loc, this.proj[k]);
          } else {
            console.error('unknown parameter type for ' + k.toString());
          }
        }
        return this.gl.drawElements(this.gl.TRIANGLE_FAN, this.indexBuffer.numItems, this.gl.UNSIGNED_SHORT, 0);
      };

      RasterLayer.prototype._textureLoaded = function() {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
        this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, true);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.texture.image);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.REPEAT);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.texture.loaded = true;
        return this.map.scheduleRedraw();
      };

      return RasterLayer;

    })();
    return RasterLayer;
  });

}).call(this);