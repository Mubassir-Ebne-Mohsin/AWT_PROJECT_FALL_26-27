// Deliberate fault for a separate unit-test process only. Never loaded by the application.
const React=require(require.resolve("react",{paths:[process.cwd()]}));const useState=React.useState;React.useState=initial=>{const result=useState(initial);return [result[0],()=>{}];};
