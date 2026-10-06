import { monthsOld, triggerMatch } from '../../src/ipv-triggers/trigger-rules';
const reports = (ratings: number[]) => ratings.map((rating, i) => ({year:2026,month:i+1,status:'SUBMITTED',ratingSnapshot:{rating,results:[{metricId:1,zone:'CRITICAL'}]}}));
describe('IPV consecutive-month rules', () => {
 it('requires three consecutive low ratings with no growth for T1', () => {
  expect(triggerMatch(reports([59,55,50]),{code:'T1',monthsCount:3,thresholdRating:60},2026,3)).not.toBeNull();
  expect(triggerMatch(reports([50,55,50]),{code:'T1',monthsCount:3,thresholdRating:60},2026,3)).toBeNull();
  expect(triggerMatch(reports([59,55,50]),{code:'T1',monthsCount:3,thresholdRating:60},2026,4)).toBeNull();
 });
 it('includes zero and does not exempt growth for T2', () => {
  expect(triggerMatch(reports([0,20,30]),{code:'T2',monthsCount:3,thresholdRating:80},2026,3)).not.toBeNull();
 });
 it('requires the same critical metric for T3', () => {
  const rows=reports([90,90,90]);
  expect(triggerMatch(rows,{code:'T3',monthsCount:3,thresholdRating:0},2026,3)).toEqual({metricId:1});
  rows[1].ratingSnapshot.results[0].metricId=2;
  expect(triggerMatch(rows,{code:'T3',monthsCount:3,thresholdRating:0},2026,3)).toBeNull();
 });
 it('does not bridge missing months or count drafts', () => {
  const rows=reports([20,20,20]);rows[1].status='NOT_FILLED';
  expect(triggerMatch(rows,{code:'T1',monthsCount:3,thresholdRating:60},2026,3)).toBeNull();
 });
 it('clamps six calendar months at the end of a month rather than overflowing into May', () => {
  expect(monthsOld(new Date('2026-05-01T00:00:00Z'),6,new Date('2026-10-31T09:00:00Z'))).toBe(false);
  expect(monthsOld(new Date('2026-04-30T09:00:00Z'),6,new Date('2026-10-31T09:00:00Z'))).toBe(true);
 });
 it('uses Moscow calendar dates for the position tenure boundary', () => {
  expect(monthsOld(new Date('2026-02-28T21:00:00Z'),6,new Date('2026-08-31T21:00:00Z'))).toBe(true);
  expect(monthsOld(new Date('2026-02-28T21:00:01Z'),6,new Date('2026-08-31T21:00:00Z'))).toBe(false);
 });
 it('does not manufacture approval dates or accept future approval even with zero minimum', () => {
  expect(monthsOld(null,6,new Date('2026-10-05'))).toBe(false);
  expect(monthsOld(null,0,new Date('2026-10-05'))).toBe(true);
  expect(monthsOld(new Date('2026-10-06'),0,new Date('2026-10-05'))).toBe(false);
 });
 it('rejects an unknown rule code instead of interpreting it as a rating rule', () => {
  expect(triggerMatch(reports([20,20,20]),{code:'INVALID',monthsCount:3,thresholdRating:60},2026,3)).toBeNull();
 });
 it('requires a valid metric id for T3', () => {
  const rows=reports([90,90,90]); rows.forEach(row=>{row.ratingSnapshot.results[0].metricId=undefined as any;});
  expect(triggerMatch(rows,{code:'T3',monthsCount:3,thresholdRating:0},2026,3)).toBeNull();
 });
});
