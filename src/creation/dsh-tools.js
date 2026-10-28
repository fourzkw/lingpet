import {z} from 'zod';
import {registerCreationTools} from './tools.js';

// The native DSH adapter shares precisely the same schemas and handlers as MCP.
export function registerDshCreationTools(ctx,service){
  registerCreationTools({registerResource(){},registerTool(name,definition,handler){
    const parameters=JSON.parse(JSON.stringify(z.toJSONSchema(definition.inputSchema,{target:'draft-7',io:'input'})));delete parameters.$schema;
    ctx.tools.register({name,description:definition.description,parameters,
      output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>value.content.filter(c=>c.type==='text').length?value.content.filter(c=>c.type==='text'):[{type:'text',text:JSON.stringify(value.structuredContent)}]},
      async execute(args,exec){exec?.signal?.throwIfAborted();
        if(name==='board_pet_preview'){
          const value=await service.preview(definition.inputSchema.parse(args));return {structuredContent:{asset:value.asset,uri:value.uri,path:value.file},content:[{type:'text',text:JSON.stringify({asset:value.asset,path:value.file,uri:value.uri})}]};
        }
        const result=await handler(args);if(result.isError)throw new Error(result.content[0].text);return JSON.parse(JSON.stringify(result));},
    });
  }},service);
}
