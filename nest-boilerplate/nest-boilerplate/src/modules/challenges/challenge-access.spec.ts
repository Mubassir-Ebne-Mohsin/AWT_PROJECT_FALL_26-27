import { Test } from "@nestjs/testing";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AuthGuard } from "@/common/guard/auth.guard";
import { AllExceptionsFilter } from "@/common/filters/all-exceptions.filter";
import { httpBoundary } from "@/common/middlewares/http-boundary";
import { TokenStore } from "@/modules/auth/token-store.service";
import { LearnerChallengesController } from "@/modules/challenges/learner-challenges.controller";
import { LearnerChallengesService } from "@/modules/challenges/learner-challenges.service";
import { phase3OpenApi } from "@/common/contracts/phase3/openapi";

describe("Challenge access: real JWT guard, isolated HTTP, stubbed data service",()=>{
 let app: NestExpressApplication;
 const id="90000000-0000-4000-8000-000000000001";
 const jwt=new JwtService({secret:"challenge-access-controlled-test-secret-only"});
 const service={list:jest.fn(()=>[{id,title:"Protected fixture"}]),detail:jest.fn(()=>({id,title:"Protected fixture"}))};
 const tokens={isAccessRevoked:jest.fn(async()=>false),isUserBlocked:jest.fn(async()=>false),sessionsEndedAt:jest.fn(async():Promise<number|null>=>null)};
 const token=(typ="access",expiresIn=300)=>jwt.sign({typ,sub:"controlled-user",email:"fixture@example.test",role:"user",jti:"controlled-jti"},{expiresIn});
 beforeAll(async()=>{const mod=await Test.createTestingModule({controllers:[LearnerChallengesController],providers:[{provide:LearnerChallengesService,useValue:service},{provide:JwtService,useValue:jwt},{provide:TokenStore,useValue:tokens},{provide:APP_GUARD,useClass:AuthGuard}]}).compile();app=mod.createNestApplication<NestExpressApplication>();app.setGlobalPrefix("v1");app.use('/v1',httpBoundary(['http://localhost:3000']));app.useGlobalFilters(new AllExceptionsFilter());await app.init();});
 afterAll(async()=>{await app.close();});
 beforeEach(()=>{jest.clearAllMocks();tokens.isAccessRevoked.mockResolvedValue(false);tokens.isUserBlocked.mockResolvedValue(false);tokens.sessionsEndedAt.mockResolvedValue(null);});
 it.each(['/v1/challenges','/v1/challenges/'+id,'/v1/challenges/not-a-uuid'])('rejects anonymous reads before data lookup: %s',async route=>{const r=await request(app.getHttpServer()).get(route).set('Cookie','sf_session=1');expect(r.status).toBe(401);expect(JSON.stringify(r.body)).not.toContain('Protected fixture');expect(r.headers['cache-control']).toContain('no-store');expect(service.list).not.toHaveBeenCalled();expect(service.detail).not.toHaveBeenCalled();});
 it('rejects malformed, expired and refresh tokens on both read endpoints',async()=>{for(const bearer of ['invalid',token('access',-1),token('refresh')])for(const route of ['/v1/challenges','/v1/challenges/'+id])await request(app.getHttpServer()).get(route).set('Authorization','Bearer '+bearer).expect(401);expect(service.list).not.toHaveBeenCalled();expect(service.detail).not.toHaveBeenCalled();});
 it('rejects revoked, blocked and ended sessions',async()=>{tokens.isAccessRevoked.mockResolvedValue(true);await request(app.getHttpServer()).get('/v1/challenges').set('Authorization','Bearer '+token()).expect(401);tokens.isAccessRevoked.mockResolvedValue(false);tokens.isUserBlocked.mockResolvedValue(true);await request(app.getHttpServer()).get('/v1/challenges/'+id).set('Authorization','Bearer '+token()).expect(401);tokens.isUserBlocked.mockResolvedValue(false);tokens.sessionsEndedAt.mockResolvedValue(Math.floor(Date.now()/1000));await request(app.getHttpServer()).get('/v1/challenges').set('Authorization','Bearer '+token()).expect(401);expect(service.list).not.toHaveBeenCalled();expect(service.detail).not.toHaveBeenCalled();});
 it('allows an authenticated learner to read catalog and briefing',async()=>{const bearer='Bearer '+token();expect((await request(app.getHttpServer()).get('/v1/challenges').set('Authorization',bearer).expect(200)).body[0].title).toBe('Protected fixture');expect((await request(app.getHttpServer()).get('/v1/challenges/'+id).set('Authorization',bearer).expect(200)).body.title).toBe('Protected fixture');expect(service.detail).toHaveBeenCalledWith(id);});
 it('documents bearer authentication for both challenge reads',()=>{const paths=phase3OpenApi().paths;expect(paths['/v1/challenges'].get.security).toEqual([{bearer:[]}]);expect(paths['/v1/challenges/{id}'].get.security).toEqual([{bearer:[]}]);});
});
