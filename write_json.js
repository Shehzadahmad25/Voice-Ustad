const fs = require('fs');
const data = {
  chapter: { unit_number: 1, title: "Stoichiometry", subject: "Chemistry", class: 11, board: "KPK", book_pages: "1-25", pdf_pages: "6-30", teaching_periods: 10, assessment: 1, weightage_percent: 8 },
  learning_objectives: [
    { id: "LO1", text: "Interpret a balanced chemical equation in terms of moles, representative particles, masses and volumes of gases (at STP)", bloom_level: "Analyzing" },
    { id: "LO2", text: "Construct mole ratios from balanced equations for use as conversion factors in stoichiometric problems", bloom_level: "Applying" },
    { id: "LO3", text: "Perform stoichiometric calculations with balanced equations using moles, masses and volumes of gases (at STP)", bloom_level: "Analyzing" },
    { id: "LO4", text: "Identify the limiting reagent in a reaction", bloom_level: "Analyzing" },
    { id: "LO5", text: "Calculate the maximum amount of product(s) and excess reagent given the limiting reagent", bloom_level: "Analyzing" },
    { id: "LO6", text: "Calculate theoretical yield, actual yield, or percentage yield given two of the three", bloom_level: "Understanding" },
    { id: "LO7", text: "Calculate the theoretical yield and percent yield given balanced equation, reactant amounts, and actual yield", bloom_level: "Applying" }
  ],
  key_points: [
    "Stoichiometry is quantitative chemistry, which deals with calculations based on balanced chemical equations.",
    "Mole is the atomic mass, molecular mass or formula mass of an element, molecule or ionic compound, expressed in grams.",
    "Avogadro number is the number of particles in one mole of substance, equal to 6.023 x 10^23.",
    "The mole concept applies to chemical equations to calculate amounts of reactants consumed or products formed.",
    "Stoichiometric problems can be solved using mole-mole, mole-mass and mass-mass conversions.",
    "When gases are involved, the molar volume at STP (22.4 dm3) is used to calculate moles and volumes.",
    "Percentage composition is the number of grams of each element per 100g of the compound.",
    "Limiting reagent is the one consumed first and gives the least amount of product.",
    "Excess reagent is the one left unreacted after the reaction is complete.",
    "Theoretical yield is the amount of product calculated from the balanced chemical equation.",
    "Actual yield is the amount of product actually produced in the experiment.",
    "Percent yield tells us what percentage of the possible amount of product was actually obtained.",
    "Chemists use percentage yield to express the efficiency of a chemical reaction."
  ],
  topics: [
    {
      section: "1.1", title: "Mole and Avogadro's Number",
      explanation: "Atomic mass expressed in grams instead of amu is called gram atomic mass. This concept is useful because we cannot see or weigh individual atoms, but we can see and weigh one gram-atom of an element. Examples: 1 gram-atom of C = 12g, Na = 23g, H = 1.008g, O = 16g. One mole of any substance contains 6.023 x 10^23 particles, known as Avogadro's number.",
      concepts: [
        { term: "Atomic Mass", definition: "The mass of one atom of an element compared to the mass of 1/12 of carbon (C-12)." },
        { term: "Gram-atom", definition: "One gram-atom of any element is the relative atomic mass of the element expressed in grams. For example 1 gram-atom of Cl = 35.5g, S = 32g." },
        { term: "Mole", definition: "The atomic mass, molecular mass, formula mass or ionic mass of a substance expressed in grams. Equal to 6.023 x 10^23 particles." },
        { term: "Avogadro's Number (NA)", definition: "The number of particles in one mole of any substance, numerically equal to 6.023 x 10^23." }
      ],
      formulas: []
    },
    {
      section: "1.2", title: "Mole Calculation",
      explanation: "Molar mass is the mass in grams of one mole of a substance. To convert mass to moles: divide mass by molar mass. To find number of particles: multiply moles by 6.023 x 10^23. For gases at STP: divide volume in dm3 by 22.4 to get moles.",
      concepts: [
        { term: "Molar Mass", definition: "The mass in grams of one mole of a substance. Numerically equal to its atomic, molecular, or formula mass." }
      ],
      formulas: [
        { id: "F1.1", name: "Moles from mass", formula: "n = mass(g) / molar mass(g/mol)", description: "Convert mass to moles or moles to mass." },
        { id: "F1.2", name: "Moles from particles", formula: "n = Number of particles / 6.023x10^23", description: "Relates moles and number of particles." },
        { id: "F1.3", name: "Moles from gas volume at STP", formula: "n = Volume(dm3) / 22.4 dm3/mol", description: "Convert gas volume at STP to moles." }
      ],
      subsections: [
        {
          section: "1.2.1", title: "Mole and Chemical Equations",
          explanation: "In a balanced equation, coefficients represent mole ratios. These ratios are used as conversion factors for mole-mole, mole-mass, and mass-mass stoichiometric calculations."
        },
        {
          section: "1.2.2", title: "Calculations Involving Gases",
          explanation: "One mole of any gas at STP (0°C, 1 atm) occupies 22.4 dm3 (molar volume). Use n = Volume/22.4 to find moles from volume, or Volume = n x 22.4 to find volume from moles.",
          formulas: [
            { id: "F1.4", name: "Gas volume at STP", formula: "Volume(dm3) = moles x 22.4 dm3/mol", description: "Calculate volume from moles or moles from volume at STP." }
          ]
        }
      ]
    },
    {
      section: "1.3", title: "Percentage Composition",
      explanation: "Percentage composition gives the mass of each element per 100g of the compound. Find the molar mass of the compound, then divide the total mass of each element by the molar mass and multiply by 100. The sum of all percentages equals 100%.",
      concepts: [
        { term: "Percentage Composition", definition: "The percent by mass of each element in a compound. It is calculated by dividing the total mass of each element by the molar mass of the compound and multiplying by 100." }
      ],
      subsections: [
        {
          section: "1.3a", title: "Percent Composition from Mass Data",
          explanation: "Use the molar mass and atomic masses of elements in the formula. Multiply atomic mass by number of atoms for each element, divide by molar mass of compound, then multiply by 100.",
          formulas: [
            { id: "F1.5", name: "Percentage of an element", formula: "% = (Total mass of element / Total mass of compound) x 100", description: "Calculate percentage composition." },
            { id: "F1.6", name: "Percentage of an element (alternate)", formula: "% = (Gram atomic mass x No. of atoms / Molar mass) x 100", description: "Alternative formula using atomic mass." }
          ]
        },
        {
          section: "1.3b", title: "Masses from Percent Composition",
          explanation: "To find the mass of an element in a sample: multiply the total mass of the sample by the percentage of that element and divide by 100."
        }
      ]
    },
    {
      section: "1.4", title: "Excess and Limiting Reagents",
      explanation: "To find the limiting reagent: convert all reactant masses to moles. Divide each by its coefficient in the balanced equation. The reactant giving the smallest value is the limiting reagent. The other reactant is the excess reagent. Only the limiting reagent controls the amount of product formed.",
      concepts: [
        { term: "Limiting Reagent", definition: "The reactant consumed first in a reaction. It gives the least moles of product and controls the amount of product formed." },
        { term: "Excess Reagent", definition: "The reactant remaining unreacted after the reaction is complete. It is present in more than the stoichiometric amount." }
      ],
      formulas: []
    },
    {
      section: "1.5", title: "Theoretical Yield and Percent Yield",
      explanation: "Theoretical yield is the maximum amount of product calculated from the balanced equation using the limiting reagent. Actual yield is always less than theoretical yield due to side reactions, incomplete reactions, or product loss. Percent yield = (Actual Yield / Theoretical Yield) x 100.",
      concepts: [
        { term: "Theoretical Yield", definition: "The amount of product calculated from the balanced chemical equation, assuming complete conversion of the limiting reagent." },
        { term: "Actual Yield", definition: "The amount of product actually produced during a chemical reaction. Always less than or equal to theoretical yield." },
        { term: "Percent Yield", definition: "A comparison of actual yield and theoretical yield, expressing reaction efficiency. Percent Yield = (Actual Yield / Theoretical Yield) x 100." }
      ],
      formulas: [
        { id: "F1.7", name: "Percent Yield", formula: "Percent Yield = (Actual Yield / Theoretical Yield) x 100", description: "Calculate the percent yield of a reaction." }
      ]
    }
  ],
  examples: [
    { id: "Ex1.1", page: 5, question: "How many moles are there in 60g of NaOH?", solution: "Molar mass NaOH = 23+16+1 = 40g/mol. n = 60/40 = 1.5 mol", answer: "1.5 mol", topic: "1.2" },
    { id: "Ex1.2", page: 6, question: "What is the mass of 0.5 moles of CaCO3?", solution: "Molar mass CaCO3 = 100g/mol. Mass = 0.5 x 100 = 50g", answer: "50g", topic: "1.2" },
    { id: "Ex1.3", page: 6, question: "8.50x10^25 molecules of water were used. Calculate the number of moles.", solution: "n = 8.50x10^25 / 6.023x10^23 = 141 mol", answer: "141 moles", topic: "1.2" },
    { id: "Ex1.4", page: 7, question: "How many formula units are present in 125g of CuSO4.5H2O?", solution: "Molar mass = 250g/mol. n = 0.5 mol. Formula units = 0.5 x 6.023x10^23 = 3.011x10^23", answer: "3.011x10^23 formula units", topic: "1.2" },
    { id: "Ex1.5", page: 8, question: "How many moles of O2 can be formed from 10 moles of KClO3? 2KClO3 -> 2KCl + 3O2", solution: "2 mol KClO3 gives 3 mol O2. 10 mol KClO3 gives 15 mol O2", answer: "15 moles of oxygen", topic: "1.2.1" },
    { id: "Ex1.6", page: 9, question: "How many grams of CO2 from 8.8 moles of ZnCO3? ZnCO3 -> ZnO + CO2", solution: "8.8 mol ZnCO3 gives 8.8 mol CO2. Molar mass CO2 = 44. Mass = 8.8 x 44 = 387.2g", answer: "387.2g", topic: "1.2.1" },
    { id: "Ex1.7", page: 10, question: "How many moles of NaCl from 15.5g HCl? HCl + NaOH -> NaCl + H2O", solution: "n(HCl) = 15.5/36.5 = 0.425 mol. 1:1 ratio, so 0.425 mol NaCl", answer: "0.425 mol NaCl", topic: "1.2.1" },
    { id: "Ex1.8", page: 10, question: "Mass of Al2O3 from 14.5g Al? 4Al + 3O2 -> 2Al2O3", solution: "n(Al)=0.54mol. 0.54mol Al -> 0.27mol Al2O3. Mass = 0.27x102 = 27.54g", answer: "27.54g", topic: "1.2.1" },
    { id: "Ex1.9", page: 12, question: "Volume of SO2 at STP from 15g sulphur? S + O2 -> SO2", solution: "n(S) = 15/32 = 0.469 mol. Volume = 0.469 x 22.4 = 10.51 dm3", answer: "10.51 dm3", topic: "1.2.2" },
    { id: "Ex1.10", page: 12, question: "Volume of Cl2 at STP to produce 10 dm3 HCl? H2 + Cl2 -> 2HCl", solution: "2mol HCl uses 1mol Cl2. 10dm3 HCl needs 5dm3 Cl2", answer: "5 dm3 Cl2", topic: "1.2.2" },
    { id: "Ex1.11", page: 14, question: "Calculate percentage composition of H2SO4.", solution: "Molar mass=98. %H=2.041%, %S=32.653%, %O=65.306%", answer: "H=2.041%, S=32.653%, O=65.306%", topic: "1.3" },
    { id: "Ex1.12", page: 15, question: "A 10.0g sample is 36% aluminium. Find masses of Al and Zn.", solution: "Mass Al = 3.6g, Mass Zn = 6.4g", answer: "Al=3.6g, Zn=6.4g", topic: "1.3" },
    { id: "Ex1.13", page: 17, question: "120g CO2 + 80g H2O -> H2CO3. Find limiting reagent and max product.", solution: "n(CO2)=2.72mol, n(H2O)=4.44mol. CO2 is limiting. Mass H2CO3 = 2.72x62 = 169.07g", answer: "CO2 is limiting reagent, 169.07g H2CO3", topic: "1.4" },
    { id: "Ex1.14", page: 19, question: "Theoretical yield of MgO from 1.92g Mg? 2Mg + O2 -> 2MgO", solution: "n(Mg)=0.08mol. MgO = 0.08x40 = 3.2g", answer: "3.2g", topic: "1.5" },
    { id: "Ex1.15", page: 20, question: "24.8g CuCO3 heated gives 13.9g CuO. Percentage yield? CuCO3 -> CuO + CO2", solution: "Theoretical = 0.2x80 = 16.0g. %Yield = (13.9/16)x100 = 86.87%", answer: "86.87%", topic: "1.5" }
  ],
  practice_problems: [
    { id: "PP1.1", page: 6, question: "Calculate molecular masses of (a) SO2 (b) Caffeine C8H10N4O2", topic: "1.2" },
    { id: "PP1.2", page: 6, question: "Calculate moles in 5.68g of iron.", topic: "1.2" },
    { id: "PP1.3", page: 7, question: "What is the mass of 1.204x10^22 atoms of lead?", topic: "1.2" },
    { id: "PP1.4", page: 9, question: "Moles of CO2 from 2.0 mol glucose combustion? C6H12O6 + 6O2 -> 6CO2 + 6H2O", topic: "1.2.1" },
    { id: "PP1.5", page: 10, question: "Grams of CO2 from 6.5 moles CaCO3? CaCO3 -> CaO + CO2", topic: "1.2.1" },
    { id: "PP1.6", page: 11, question: "Mass of CO2 from 856g glucose?", topic: "1.2.1" },
    { id: "PP1.7", page: 13, question: "Molecules in 11.5dm3 N2 at STP? Volume of 3 moles O2 at STP?", topic: "1.2.2" },
    { id: "PP1.8", page: 14, question: "Percentage of each element in (a) C6H6 (b) C6H12O6", topic: "1.3" },
    { id: "PP1.9", page: 15, question: "Percent composition of H3PO4.", topic: "1.3" },
    { id: "PP1.10", page: 18, question: "0.600 mol Cl2 + 0.500 mol Al. Which is excess? Moles of AlCl3?", topic: "1.4" },
    { id: "PP1.11", page: 20, question: "1.274g CuSO4 + Zn gives 0.392g Cu. Percentage yield?", topic: "1.5" }
  ],
  exercise: {
    mcqs: [
      { id: "MCQ1", question: "The mass of an atom compared with the mass of one atom of C-12 is called,", options: ["One mole", "Gram atomic mass", "Atomic number", "Relative atomic mass"], answer: "d" },
      { id: "MCQ2", question: "Which of the following is not true for a mole?", options: ["It is a counting unit", "It is the gram atomic or gram formula mass", "It contains 6.023x10^23 particles", "It contains different number of particles for different substances"], answer: "d" },
      { id: "MCQ3", question: "What is the mass in grams of 5 moles of water (H2O)?", options: ["90g", "36g", "18g", "100g"], answer: "a" },
      { id: "MCQ4", question: "The number of molecules in 22g of CO2 is", options: ["6.023x10^23", "3.011x10^23", "6.023x10^21", "6.023x10^22"], answer: "b" },
      { id: "MCQ5", question: "What are the values at standard conditions (STP)?", options: ["100C, 1 atm", "298K, 1atm", "273K, 760mm Hg", "0C, 760cm Hg"], answer: "c" },
      { id: "MCQ6", question: "The molar volume of SO2 gas at STP is,", options: ["64dm3", "24dm3", "22.4dm3", "22.4cm3"], answer: "c" },
      { id: "MCQ7", question: "The percentage of Ca in CaCO3 is,", options: ["12%", "10%", "48%", "40%"], answer: "d" },
      { id: "MCQ8", question: "Given CO2(g) + C(s) -> 2CO(g). Which equivalence is not correct?", options: ["1mol CO2 = 2 mol CO", "1mol C = 56g CO", "44g CO2 = 28g CO", "44g CO2 = 12g C"], answer: "c" },
      { id: "MCQ9", question: "A limiting reactant is one which", options: ["Is present in maximum amount", "Produces minimum moles of product", "Produces maximum moles of product", "Does not affect amount of product"], answer: "b" },
      { id: "MCQ10", question: "Efficiency of a chemical reaction is checked by calculating", options: ["Actual yield", "Theoretical Yield", "Percentage Yield", "Amount of reactant unused"], answer: "c" },
      { id: "MCQ11", question: "Actual yield will reach theoretical value if percent yield is,", options: ["10%", "50%", "90%", "100%"], answer: "d" },
      { id: "MCQ12", question: "Maximum moles are present in", options: ["11.2dm3 H2 at STP", "44.8dm3 N2 at STP", "67.2dm3 CO2 at STP", "22.4dm3 O2 at STP"], answer: "c" }
    ],
    short_questions: [
      { id: "SQ1", question: "What is gram atom? Why is the concept of gram atom useful in chemistry?" },
      { id: "SQ2", question: "Explain why balanced chemical equations are used in stoichiometric problems?" },
      { id: "SQ3", question: "How will you identify the limiting reagent in a reaction and how does it control product amount?" },
      { id: "SQ4", question: "Why is the actual yield always less than the theoretical yield?" },
      { id: "SQ5", question: "Distinguish between limiting and excess reagent." }
    ],
    numerical_questions: [
      { id: "NQ1", question: "Mass of 5 moles of element X is 60g. Calculate molar mass and name the element.", answer: "12, Carbon" },
      { id: "NQ2", question: "Calculate formula masses of (a) C2H5OH (b) Al2O3 (c) K2Cr2O7", answer: "(a) 46, (b) 102, (c) 294" },
      { id: "NQ3", question: "Mass in grams of (a) 7.75 moles Al2O3 (b) 15 moles H2SO4", answer: "(a) 790.5g, (b) 994g" },
      { id: "NQ4", question: "Moles in (a) 30g MgS (b) 75g Ca (c) 40dm3 O2 at STP", answer: "(a) 0.536 (b) 1.875 (c) 1.786" },
      { id: "NQ5", question: "Mass of Mg to consume 2560g CO2? 2Mg + CO2 -> 2MgO + C", answer: "2.79g" }
    ],
    descriptive_questions: [
      { id: "DQ1", question: "Define mole and Avogadro's number with examples.", answer: "" },
      { id: "DQ2", question: "What is percentage composition? Calculate for MgSO4, KMnO4, NaAl(SO4)2.", answer: "" },
      { id: "DQ3", question: "C + H2O -> CO + H2. Identify limiting reagent if 24.5g C and 1.89 mol H2O are mixed.", answer: "Water is limiting reagent" },
      { id: "DQ4", question: "Calculate percent yield if 6.53g H2 produced when 5mol Zn reacted with HCl.", answer: "65.3%" },
      { id: "DQ5", question: "N2 + 3H2 -> 2NH3. Moles of NH3 if 6.3dm3 N2 reacts at STP?", answer: "0.56 mol" }
    ]
  }
};
fs.writeFileSync('./content/chapters/chapter1_stoichiometry.json', JSON.stringify(data, null, 2));
console.log('Written:', fs.statSync('./content/chapters/chapter1_stoichiometry.json').size, 'bytes');
