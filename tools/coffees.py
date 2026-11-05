"""The range, transcribed from Liquid's own catalogues (Linktree > Google Drive PDFs).

Spelling slips in the PDFs are corrected here ("Columbia", "Guatamala"). Prices are
MVR per sleeve of 10 including GST.
"""
A, B, R = "Arabica", "Arabica and Robusta", "Robusta"
ESP, RIS, LUN, GRAN, MUG = 40, 25, 110, 150, 230

def c(name, code, desc, inten, notes, species, origin, price, cups, rng, line="Original", decaf=False, process=None, species_note=None, slug=None):
    return dict(id=slug or name.lower().replace(" ", "-").replace("è", "e"), name=name, code=code, desc=desc, intensity=inten,
                notes=notes, species=species, species_note=species_note, origin=origin, price=price, cups=cups,
                range=rng, line=line, decaf=decaf, process=process)

IT, MO, WE, BC, CL = "Ispirazione Italiana", "Master Origins", "World Explorations", "Barista Creations", "Classics"
COFFEES = [
 c("Capriccio","NSA0137","Rich and distinctive",5,["Cereal"],B,["Colombia","Brazil"],147,[ESP],CL),
 c("Volluto","NSA0132","Sweet and light",4,["Cereal"],A,["Costa Rica","Kenya"],147,[ESP],CL),
 c("Volluto Decaffeinato","NSA0141","Mild and delicately toasted",4,["Cereal"],A,["Brazil","Colombia"],162,[ESP],CL,decaf=True),
 c("Cosi","NSA0131","Mild and delicately toasted",4,["Fruity"],A,["Brazil","Colombia"],147,[ESP],CL),
 c("Napoli","NSA0187","Exceptionally dark and creamy",13,["Bitter","Cocoa"],B,["India","Uganda"],147,[RIS,ESP],IT),
 c("Kazaar","NSA0184","Exceptionally intense and syrupy",12,["Spicy","Woody"],R,["India","Nicaragua"],147,[RIS,ESP],IT,species_note="Robusta, with a touch of Arabica"),
 c("Ristretto","NSA0180","Powerful and contrasting",10,["Intensely roasted","Fruity"],B,["Colombia","Brazil"],147,[RIS,ESP],IT),
 c("Ristretto Decaffeinato","NSA0186","Powerful and contrasting",10,["Intensely roasted","Fruity"],B,["Colombia","Brazil"],162,[RIS,ESP],IT,decaf=True),
 c("Arpeggio","NSA0181","Intense and creamy",9,["Fruity","Cocoa"],A,["Brazil","Costa Rica"],147,[RIS,ESP],IT),
 c("Arpeggio Decaffeinato","NSA0185","Intense and creamy",9,["Fruity","Cocoa"],A,["Brazil","Costa Rica"],162,[RIS,ESP],IT,decaf=True),
 c("Arpeggio Extra","NSA0903","Intense and creamy",9,["Cocoa","Intensely roasted"],A,["Brazil","Guatemala"],183,[RIS,ESP],IT),
 c("Roma","NSA0182","Full and balanced",8,["Woody","Cereal"],A,["Brazil","Mexico"],147,[RIS,ESP],IT),
 c("Venezia","NSA0188","Balanced and thick",8,["Roasted caramel"],B,["Brazil","Mexico"],147,[RIS,ESP],IT),
 c("Livanto","NSA0183","Round and balanced",6,["Caramel","Cereal"],A,["Brazil","Guatemala"],147,[ESP],IT),
 c("India","NSA0149","Intense and spicy",11,["Spicy"],B,["India"],175,[ESP,LUN],MO,process="Monsooned"),
 c("Indonesia","NSA0147","Rich and woody",8,["Woody"],A,["Indonesia"],175,[ESP,LUN],MO,process="Wet-hulled"),
 c("Colombia","NSA0146","Fruity and vibrant",6,["Biscuit"],A,["Colombia"],175,[ESP,LUN],MO,process="Late-harvested"),
 c("Nicaragua","NSA0189","Sweet and light",5,["Honey","Cereal"],A,["Nicaragua"],175,[ESP,LUN],MO,process="Black honey"),
 c("Ethiopia","NSA0148","Flowery and bright",4,["Fruity","Flowery"],A,["Ethiopia"],175,[ESP,LUN],MO,process="Sun-dried"),
 c("Rio de Janeiro Espresso","NSA0300","Herbal and spicy",9,["Sandalwood","Herbal"],A,["Brazil"],162,[ESP],WE,slug="rio-de-janeiro"),
 c("Istanbul Espresso","NSA0302","Intense and spicy",8,["Spicy","Fruity"],A,["India","Ethiopia"],162,[ESP,LUN],WE,slug="istanbul"),
 c("Paris Espresso","NSA0301","Fruity and vibrant",6,["Cereal","Nuts"],B,["Brazil","Colombia"],162,[ESP],WE,slug="paris"),
 c("Shanghai Lungo","NSA0175","Fruity with fine acidity",5,["Fruity"],A,["Kenya","China"],162,[LUN],WE,slug="shanghai"),
 c("Buenos Aires Lungo","NSA0179","Sweet and cereal",4,["Cereal"],A,["Colombia","Uganda"],162,[LUN],WE,slug="buenos-aires"),
 c("Cape Town Lungo","NSA0177","Potent and roasted",10,["Woody"],B,["India","Mexico"],162,[LUN],WE,slug="cape-town"),
 c("Stockholm Lungo","NSA0176","Rich and full-bodied",8,["Cereal"],A,["Colombia","Costa Rica"],162,[LUN],WE,slug="stockholm"),
 c("Tokyo Lungo","NSA0174","Floral and complex",6,["Flowery"],A,["Colombia","Costa Rica"],162,[LUN],WE,slug="tokyo"),
 c("Vienna Lungo","NSA0178","Round and smooth",6,["Cereal"],A,["Brazil","Colombia"],162,[LUN],WE,slug="vienna"),
 c("Vienna Lungo Decaffeinato","NSA0902","Round and smooth",6,["Cereal"],A,["Brazil","Colombia"],163,[LUN],WE,decaf=True,slug="vienna-decaffeinato"),
 c("Corto","NSA0169","For extra intense recipes with milk",None,["Spicy"],B,["Uganda","Ethiopia"],175,[ESP],BC),
 c("Scuro","NSA0170","For intense yet balanced recipes with milk",None,["Sweet roast"],A,["Colombia","Ethiopia"],175,[ESP],BC),
 c("Chiaro","NSA0168","For sweet and smooth recipes with milk",None,["Biscuit"],A,["Kenya","Indonesia"],175,[ESP],BC),
 c("Caramello","NSA0304","Creamy and caramel flavoured",None,["Biscuit","Nutty"],A,["Brazil","Colombia"],175,[ESP],BC),
 c("Vaniglia","NSA0303","Custardy and vanilla flavoured",None,["Biscuit","Cereal"],A,["Brazil","Colombia"],175,[ESP],BC),
 c("Cioccolatino","NSA0305","Creamy and chocolatey",None,["Biscuit","Cereal"],A,["Brazil","Colombia"],175,[ESP],BC),
 c("Nocciola","NSA0306","Rich and nutty",None,["Praline","Biscuit","Cereal"],A,["Brazil","Colombia"],175,[ESP],BC),
 # Vertuo
 c("Voltesso","NSA0820","Light and sweet",4,["Biscuit","Cereal"],A,["Brazil","Colombia"],225,[ESP],"Espresso","Vertuo"),
 c("Altissio","NSA0818","Full-bodied and creamy",9,["Cereal"],B,["Brazil","Costa Rica"],225,[ESP],"Espresso","Vertuo"),
 c("Altissio Decaffeinato","NSA0815","Full-bodied and creamy",9,["Cereal"],None,[],204,[ESP],"Espresso","Vertuo",decaf=True),
 c("Il Caffè","NSA0809","Intense and velvety",11,["Roasted","Chocolatey"],B,["Vietnam","Indonesia","Colombia"],225,[ESP],"Espresso","Vertuo"),
 c("Ristretto Intenso","NSA0810","Spicy and woody",12,["Woody","Earthy"],None,[],225,[RIS],"Espresso","Vertuo"),
 c("Stormio","NSA0813","Rich and strong",8,["Woody","Earthy"],A,["Nicaragua","Guatemala"],270,[MUG],"Coffee","Vertuo"),
 c("Melozio","NSA0816","Smooth and balanced",6,["Cereal"],A,["Brazil","Guatemala"],204,[MUG],"Coffee","Vertuo"),
 c("Roasted Hazelnut","NSA0812","Rich and nutty",None,["Hazelnut"],A,["Brazil","Ethiopia"],307,[MUG],BC,"Vertuo"),
 c("Golden Caramel","NSA0811","Creamy and biscuity",None,["Caramel"],None,[],307,[MUG],BC,"Vertuo"),
 c("Costa Rica","NSA0819","Malty and sweet",7,["Nutty","Balanced"],A,["Costa Rica"],307,[GRAN],"Master Crafted Single Origins","Vertuo",process="Fully washed"),
]
# Tone for coffees with no printed intensity, so the bean still looks right.
MILK_TONE = {"Corto":11,"Scuro":9,"Chiaro":6,"Caramello":6,"Vaniglia":5,"Cioccolatino":7,"Nocciola":7,"Roasted Hazelnut":8,"Golden Caramel":6}
