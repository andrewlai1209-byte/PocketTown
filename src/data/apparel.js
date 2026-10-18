// Individually art-directed resident palettes and silhouettes shared by the GLB builder and town renderer.
export const APPAREL={
  Mira:{skin:0xb97859,hair:0x30211c,coat:0x8f3e38,shirt:0xf3dfc7,pants:0x484252,shoe:0x35261f,trim:0xd6a35e,apron:0xdcc9a6,pattern:'woven',accessory:'headwrap',height:1,build:1.02},
  Noah:{skin:0xd9a27d,hair:0x302c2a,coat:0xe5e8dc,shirt:0xc2ddd2,pants:0x526b6c,shoe:0x343a3b,trim:0x6caba1,apron:0xffffff,pattern:'pinstripe',accessory:'stethoscope',height:1.02,build:.98},
  Ada:{skin:0xe5b68f,hair:0x714b35,coat:0x635479,shirt:0xe9ddca,pants:0x443e50,shoe:0x41303a,trim:0xd1b77e,apron:0x8a7694,pattern:'herringbone',accessory:'glasses',height:1.01,build:.96},
  Leo:{skin:0xd69a78,hair:0x292226,coat:0x543e4f,shirt:0xf1dfca,pants:0x383744,shoe:0x33252b,trim:0xb88b58,apron:0x302b35,pattern:'fine-stripe',accessory:'barista',height:1.02,build:.98},
  Ivy:{skin:0xc78a61,hair:0x6e442c,coat:0x687545,shirt:0xdcc795,pants:0x4e6042,shoe:0x46352a,trim:0xc78a44,apron:0x687545,pattern:'canvas',accessory:'straw-hat',height:1,build:1.08},
  June:{skin:0xd49b72,hair:0x493027,coat:0x9c6241,shirt:0xf1dfc3,pants:0x4f5260,shoe:0x453027,trim:0xd7ad67,apron:0xb98451,pattern:'plaid',accessory:'scarf',height:1.01,build:1.02},
  Finn:{skin:0xb97f5c,hair:0x3d352f,coat:0x455969,shirt:0xb9c8c8,pants:0x41494d,shoe:0x362e29,trim:0xc39154,apron:0x916b43,pattern:'heavy-weave',accessory:'goggles',height:1.02,build:1.1},
  Sage:{skin:0xe1bc9d,hair:0xaaa19a,coat:0x65536d,shirt:0xe9e0d0,pants:0x514d58,shoe:0x45383c,trim:0xc6a470,apron:0x796886,pattern:'knit',accessory:'glasses',height:1.01,build:.98},
  Wren:{skin:0xc58e69,hair:0x473326,coat:0x9c713f,shirt:0xe9dec5,pants:0x3e4c5b,shoe:0x3e3027,trim:0xe0bd75,apron:0x8b6740,pattern:'canvas',accessory:'mail-cap',height:1.03,build:1.02},
  'Mayor Ellis':{skin:0xc99879,hair:0x77716a,coat:0x405266,shirt:0xf4eddf,pants:0x37414e,shoe:0x302b29,trim:0xc7a15d,apron:0x53677a,pattern:'fine-stripe',accessory:'mayor-sash',height:1.04,build:1.03},
  Pip:{skin:0xf0c5a2,hair:0x9a6541,coat:0x7790a0,shirt:0xf3e8cf,pants:0x566b79,shoe:0x4a3a32,trim:0xd98d71,apron:0x71899a,pattern:'knit',accessory:'backpack',height:.86,build:.86},
  'Nana Rose':{skin:0xc9937b,hair:0xb8a897,coat:0x796883,shirt:0xf0dfd2,pants:0x605568,shoe:0x493941,trim:0xd4a86a,apron:0x9b8498,pattern:'floral',accessory:'flower-brooch',height:.94,build:1.04}
};

export const apparelFor=name=>APPAREL[name]||APPAREL.Mira;
