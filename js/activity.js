define(["sugar-web/activity/activity", "sugar-web/graphics/colorpalette", "texturepalette"], function(activity, colorpalette, texturepalette) {

    // Manipulate the DOM only when it is ready.
    requirejs(['domReady!'], function(doc) {

        // Initialize the activit   y.
        // activity.setup();

        var diceColor = document.getElementById("dice-color");
        var changeDiceColor = new colorpalette.ColorPalette(diceColor);
        changeDiceColor.setColor('rgb(255,255,255)');
        changeDiceColor.addEventListener('colorChange', function(e) {
            $t.color = e.detail.color;
        });

        var add_desktexture = new texturepalette.TexturePalette(document.getElementById("floor-color"), "Add Textture");
        add_desktexture.addEventListener('addMat', function(event) {
            $t.changeTexture(event.mat);
            // if (presence) {
            // 	presence.sendMessage(presence.getSharedInfo().id, {
            // 		user: presence.getUserInfo(),
            // 		content: {
            // 			action: 'update',
            // 			data: currentenv.user.colorvalue
            // 		}
            // 	});
            // }
        });
    });

});