define(["sugar-web/graphics/palette", "text!texturepalette.html"], function(palette, template) {

    var texturepalette = {};

    texturepalette.TexturePalette = function(invoker, primaryText) {
        palette.Palette.call(this, invoker, primaryText);
        var containerElem = document.createElement('div');
        containerElem.innerHTML = template;
        this.setContent([containerElem]);
        this.addTexture = document.createEvent('CustomEvent');
        this.addTexture.initCustomEvent('addMat', true, true, { mat: '' });
        var that = this;
        document.getElementById("mat-one").addEventListener('click', function(event) {
            that.addTexture.mat = "../src/grass.png";

            that.getPalette().dispatchEvent(that.addTexture);
            that.popDown();
        });
        document.getElementById("mat-two").addEventListener('click', function(event) {
            that.addTexture.mat = "https://i.ibb.co/TtGrzgY/floor.jpg";

            that.getPalette().dispatchEvent(that.addTexture);
            that.popDown();
        });
    };

    var addEventListener = function(type, listener, useCapture) {
        return this.getPalette().addEventListener(type, listener, useCapture);
    };

    texturepalette.TexturePalette.prototype = Object.create(palette.Palette.prototype, {
        addEventListener: {
            value: addEventListener,
            enumerable: true,
            configurable: true,
            writable: true
        }
    });
    return texturepalette;
});