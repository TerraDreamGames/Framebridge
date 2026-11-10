import Prism from "prismjs";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

// Luau's generated output shares Lua syntax, with extra keywords and Roblox types.
Prism.languages.luau = Prism.languages.extend("lua", {
  keyword:
    /\b(?:and|break|continue|do|else|elseif|end|export|for|function|if|in|local|nil|not|or|repeat|return|then|type|typeof|until|while)\b/,
  number:
    /\b(?:0b[01_]+|0x[\da-f_]+(?:\.[\da-f_]*)?(?:p[+-]?[\d_]+)?|\d[\d_]*(?:\.(?!\.)[\d_]*)?(?:e[+-]?[\d_]+)?)\b|\B\.[\d_]+(?:e[+-]?[\d_]+)?\b/i,
});
Prism.languages.insertBefore("luau", "keyword", {
  boolean: /\b(?:false|true)\b/,
  builtin:
    /\b(?:game|workspace|script|Enum|Instance|UDim2?|Vector[23]|Color3|CFrame|Rect|Font|TweenInfo|ColorSequence(?:Keypoint)?|NumberSequence(?:Keypoint)?|NumberRange|PhysicalProperties|Ray|Region3|BrickColor|task|buffer|bit32|utf8)\b/,
});

export { Prism };
