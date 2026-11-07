import { Body,Controller,Delete,Get,HttpCode,Param,ParseUUIDPipe,Patch,Post } from "@nestjs/common";
import { ApiBearerAuth,ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "@/common/decorators";
import { RequirePermission } from "@/common/decorators/permission.decorator";
import { Permission } from "@/common/enums/account-role.enum";
import { AuthUser } from "@/common/interfaces/auth-user.interface";
import { SavedRepliesService } from "@/modules/support/saved-replies.service";
@ApiTags("support") @ApiBearerAuth() @Controller("support/saved-replies")
@RequirePermission(Permission.SUPPORT_INBOX_REPLY)
export class SavedRepliesController {
 constructor(private readonly saved:SavedRepliesService){}
 @Get() list(@CurrentUser() u:AuthUser){return this.saved.list(u.id);}
 @Post() create(@CurrentUser() u:AuthUser,@Body() b:unknown){return this.saved.create(u,b);}
 @Patch(":id") edit(@CurrentUser() u:AuthUser,@Param("id",ParseUUIDPipe) id:string,@Body() b:unknown){return this.saved.edit(u,id,b);}
 @Delete(":id") remove(@CurrentUser() u:AuthUser,@Param("id",ParseUUIDPipe) id:string,@Body() b:unknown){return this.saved.remove(u,id,b);}
 @Post(":id/preview") @HttpCode(200) preview(@CurrentUser() u:AuthUser,@Param("id",ParseUUIDPipe) id:string,@Body() b:unknown){return this.saved.preview(u,id,b);}
}
