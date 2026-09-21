let NUMBER_OF_MARKS = 40;

export const init = async model => {
    let dial = model.add().move(0, 1.4, 0);


    dial.add('tubeZ').scale(.08, .08, .015).color(.3, .3, .35);
    
    dial.add('coneY')
        .move(0, .095, .016)
        .turnZ(Math.PI)
        .scale(.008, .012, .008)
        .color(.9,.9,.2);
    
    for (let n = 0; n < NUMBER_OF_MARKS; n++) {
        let big = n % 5 == 0;
        dial.add('cube')
            .turnZ(n*2*Math.PI / NUMBER_OF_MARKS)
            .move(.07, 0, .016)
            .scale(big ? .010 : .005, .0025, .001)
            .color(big ? .9 : .6, big ? 0 : .6, big ? 0 : .6);
    }

     model.animate(() => dial.identity().move(0,1.4,0).turnZ(model.time));
}