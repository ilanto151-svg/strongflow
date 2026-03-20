export const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export const TYPE_META = {
  resistance:{ label:"Resistance", color:"#f59e0b", bg:"#fffbeb", icon:"🏋️" },
  aerobic:   { label:"Aerobic",    color:"#3b82f6", bg:"#eff6ff", icon:"🏃" },
  other:     { label:"Other",      color:"#8b5cf6", bg:"#f5f3ff", icon:"✨" },
};

export const LIBRARY = {
  resistance:[
    {id:"r1",name:"Wall Push-ups",         image:"💪", equipment:"Wall",            description:"Push against wall at arm's length"},
    {id:"r2",name:"Resistance Band Rows",  image:"🏋️",equipment:"Resistance band", description:"Pull band toward chest, seated"},
    {id:"r3",name:"Seated Leg Extensions", image:"🦵", equipment:"Chair",           description:"Extend each leg straight while seated"},
    {id:"r4",name:"Bicep Curls",           image:"💪", equipment:"Light dumbbells", description:"Curl weights toward shoulders"},
    {id:"r5",name:"Calf Raises",           image:"🦶", equipment:"None / wall",     description:"Rise onto toes, hold 2 sec"},
    {id:"r6",name:"Seated Shoulder Press", image:"🙌", equipment:"Light dumbbells", description:"Press overhead from shoulder height"},
  ],
  aerobic:[
    {id:"a1",name:"Seated Marching", image:"🚶",  equipment:"Chair",  description:"Lift knees alternately while seated"},
    {id:"a2",name:"Walking",         image:"🚶‍♀️",equipment:"None",   description:"Steady-paced walk on flat ground"},
    {id:"a3",name:"Stationary Bike", image:"🚴",  equipment:"Bike",   description:"Low-resistance cycling"},
    {id:"a4",name:"Arm Circles",     image:"🤸",  equipment:"None",   description:"Controlled forward/backward arm rotations"},
    {id:"a5",name:"Step Touch",      image:"💃",  equipment:"None",   description:"Side-to-side step with arm swing"},
    {id:"a6",name:"Aqua Walking",    image:"🏊",  equipment:"Pool",   description:"Walking in chest-deep water"},
  ],
  other:[
    {id:"o1",name:"Deep Breathing",    image:"🧘",  equipment:"None", description:"Diaphragmatic breathing, 5 counts in/out"},
    {id:"o2",name:"Gentle Yoga",       image:"🧘‍♀️",equipment:"Mat",  description:"Slow restorative yoga postures"},
    {id:"o3",name:"Shoulder Rolls",    image:"🤸",  equipment:"None", description:"Roll shoulders forward and backward"},
    {id:"o4",name:"Ankle Circles",     image:"🦶",  equipment:"None", description:"Rotate ankles clockwise and counterclockwise"},
    {id:"o5",name:"Neck Stretches",    image:"🧖",  equipment:"None", description:"Slow side-to-side neck tilts"},
    {id:"o6",name:"Mindful Relaxation",image:"😌",  equipment:"None", description:"Guided body-scan relaxation"},
  ],
};

export const RPE = {
  0:"Nothing at all", 1:"Very light", 2:"Light", 3:"Moderate", 4:"Somewhat hard",
  5:"Hard", 6:"Hard+", 7:"Very hard", 8:"Very hard+", 9:"Very severe", 10:"Maximum"
};

export const INTENSITY_OPTIONS = ["warm-up","easy","moderate","vigorous","cool-down","recovery","sprint"];
