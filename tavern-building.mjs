/** Canonical normalized tavern floorplan. World x runs west→east; world y runs north→south. */
export const TAVERN_BUILDING = Object.freeze({
  version:1, canvas:{width:1000,height:760}, footprint:{width:850,depth:470},
  projection:Object.freeze({originX:420,baseY:203,scaleX:.54,scaleY:.255,scaleZ:.72}),
  orientation:Object.freeze({north:'river facade with long windows',south:'old street and arched entrance',east:'bar, service and small back kitchen',west:'commons, lounge and window seats'}),
  materials:Object.freeze({walnut:'#795149',cream:'#f7e1c9',oldBrick:'#6f4a4c',berryPink:'#da859e',river:'#86c8ce'}),
  rooms:Object.freeze({commons:{x:30,y:125,width:335,depth:300},windowSeats:{x:180,y:24,width:390,depth:92},gameFloor:{x:380,y:125,width:440,depth:315},bar:{x:735,y:90,width:90,depth:220},backKitchen:{x:738,y:18,width:105,depth:66}}),
  anchors:Object.freeze({riverWindows:{x:425,y:0},entrance:{x:185,y:470},bar:{x:785,y:220},kitchen:{x:785,y:48},commons:{x:205,y:278},tables:Object.freeze([{x:505,y:170},{x:690,y:170},{x:505,y:340},{x:690,y:340}])}),
  // Stable visitor markers sit on clear floor patches; capacities are visual seats, not reservations.
  visitorAreas:Object.freeze({
    bar:Object.freeze({capacity:3,seats:Object.freeze([[720,360],[755,390],[700,405]])}),
    window:Object.freeze({capacity:5,seats:Object.freeze([[285,82],[335,82],[385,82],[435,82],[475,82]])}),
    quiet:Object.freeze({capacity:3,seats:Object.freeze([[385,365],[425,390],[460,365]])}),
    commons:Object.freeze({capacity:5,seats:Object.freeze([[75,315],[145,365],[255,285],[295,365],[330,310]])})
  }),
  reserved:Object.freeze({northDeck:{x:380,y:-42,width:220,depth:32},eastAnnex:{x:875,y:130,width:30,depth:190}}),
  fixtures:Object.freeze({
    oak_table:{x:205,y:310,shape:'table'},window_seat:{x:380,y:35,shape:'seat'},bookshelf:{x:42,y:206,shape:'shelf'},coat_rack:{x:120,y:420,shape:'rack'},bar_counter:{x:786,y:224,shape:'counter'},copper_lamp:{x:415,y:178,shape:'lamp'},paper_lanterns:{x:475,y:250,shape:'lantern'},table_lamp:{x:300,y:350,shape:'lamp'},neon_sign:{x:825,y:300,shape:'sign'},river_photo:{x:78,y:138,shape:'frame'},ceramic_vase:{x:345,y:205,shape:'vase'},chalk_menu:{x:730,y:240,shape:'board'},wall_clock:{x:50,y:110,shape:'clock'},record_player:{x:260,y:350,shape:'gramophone'},plant_corner:{x:330,y:385,shape:'plant'},rain_bell:{x:415,y:-10,shape:'bell'},tea_station:{x:765,y:58,shape:'tea'},pastry_case:{x:765,y:130,shape:'case'},seating:{x:222,y:330,shape:'seating'},lighting:{x:500,y:245,shape:'lamp'},sound:{x:665,y:85,shape:'speaker'},climate:{x:760,y:75,shape:'fan'},counter:{x:790,y:305,shape:'counter'},patio:{x:490,y:-28,shape:'deck'}
  })
});
export const TAVERN_BUILDING_SPEC=TAVERN_BUILDING;
export default TAVERN_BUILDING;
