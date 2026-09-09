import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { colors } from '../../shared/theme/colors';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';
import { QueryBoundary, EmptyState } from '../../shared/components/QueryStates';
import { useUserDashboard, useCourtCaseDetails, useInvestigationProgress } from '../../shared/services/hooks';

// Real, live status from the Investigating Officer's own record
const ACCUSED_STATUS_TONE = {
  'In Custody': { bg: '#E4F5EC', fg: '#2F8A5B' },
  Convicted: { bg: '#E4F5EC', fg: '#2F8A5B' },
  'Out on Bail': { bg: '#FEF3C7', fg: '#9A5B06' },
  Absconding: { bg: '#FBE9E8', fg: '#A13934' },
};

function InvestigationProgressCard({ data }) {
  if (!data || (!data.accusedStatus && !data.investigationProgress && data.chargesheetStatus === 'Not Filed' && !data.investigationCompleteAt)) return null;
  const tone = ACCUSED_STATUS_TONE[data.accusedStatus];
  return (
    <View style={styles.cardContainer}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.cardHeaderIconTile}>
            <Feather name="shield" size={18} color="#3B5998" />
          </View>
          <View>
            <Text style={styles.cardTitle}>Investigation Progress</Text>
            <Text style={styles.cardSubTitle}>Current status from investigating record</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardContent}>
        {data.accusedStatus && (
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Accused Status</Text>
            <View style={[styles.statusPill, tone && { backgroundColor: tone.bg }]}>
              <Text style={[styles.statusPillText, tone && { color: tone.fg }]}>{data.accusedStatus}</Text>
            </View>
          </View>
        )}
        <Row label="Chargesheet" value={data.chargesheetStatus === 'Filed' ? `Filed ${formatDate(data.chargesheetFiledAt)}` : 'Not yet filed'} />
        <Row
          label="Investigation"
          value={data.investigationCompleteAt ? `Completed ${formatDate(data.investigationCompleteAt)}` : 'Ongoing'}
        />
        {data.investigationProgress && (
          <Text style={styles.progressText}>{data.investigationProgress}</Text>
        )}
        {(data.firDocumentUrl || data.chargesheetDocumentUrl) && (
          <View style={styles.documentRow}>
            {data.firDocumentUrl && (
              <Pressable style={styles.documentBtn} onPress={() => Linking.openURL(data.firDocumentUrl)}>
                <Feather name="download" size={14} color="#3B5998" />
                <Text style={styles.documentBtnText}>FIR Copy (PDF)</Text>
              </Pressable>
            )}
            {data.chargesheetDocumentUrl && (
              <Pressable style={styles.documentBtn} onPress={() => Linking.openURL(data.chargesheetDocumentUrl)}>
                <Feather name="download" size={14} color="#3B5998" />
                <Text style={styles.documentBtnText}>Chargesheet (PDF)</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function Row({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PartyList({ icon, title, pillBg, pillFg, parties, isLast }) {
  if (!parties || parties.length === 0) return null;
  return (
    <View style={[styles.partyColumn, isLast && { borderRightWidth: 0 }]}>
      <View style={styles.partyHeaderRow}>
        <View style={[styles.partyPill, { backgroundColor: pillBg }]}>
          <Feather name={icon} size={14} color={pillFg} style={{ marginRight: 6 }} />
          <Text style={[styles.partyPillText, { color: pillFg }]}>{title}</Text>
        </View>
      </View>
      {parties.map((p, i) => (
        <View key={i} style={styles.partyTextContainer}>
          <Text style={styles.partyName}>
            {p.name} {p.role ? <Text style={styles.partyRole}>({p.role})</Text> : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

function HearingGridCell({ icon, label, value, isLast }) {
  if (value == null || value === '') return null;
  return (
    <View style={[styles.hearingCell, isLast && { borderRightWidth: 0 }]}>
      <View style={styles.hearingIconTile}>
        <Feather name={icon} size={16} color="#3B82F6" />
      </View>
      <View style={styles.hearingTextContainer}>
        <Text style={styles.hearingLabel}>{label}</Text>
        <Text style={styles.hearingValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function CaseDetailsScreen({ navigation, route }) {
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const dashboardQuery = useUserDashboard();
  const linkedCases = dashboardQuery.data?.linkedCases || [];

  const [selectedUserId, setSelectedUserId] = useState(route?.params?.caseUserId || null);

  const activeUserId = selectedUserId || linkedCases[0]?.userId;
  const activeCase = linkedCases.find((c) => c.userId === activeUserId);
  const courtQuery = useCourtCaseDetails(activeUserId);
  const investigationQuery = useInvestigationProgress(activeUserId);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.topHeader,
          isDesktop && styles.topHeaderDesktop,
          !isDesktop && { paddingTop: insets.top + spacing.xs, paddingBottom: spacing.sm },
        ]}
      >
        <View style={styles.headerLeft}>
          {!isDesktop && (
            <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={20} color={colors.primaryDark} />
            </Pressable>
          )}
          <View style={styles.headerIconTile}>
            <Feather name="file-text" size={20} color={colors.primaryDark} />
          </View>
          <Text style={styles.headerTitle}>Case Details</Text>
        </View>
        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions fullName={dashboardQuery.data?.fullName} alertCount={dashboardQuery.data?.alerts?.length || 0} onBellPress={() => {}} />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <ScrollView style={styles.scrollView} bounces={false} showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          {linkedCases.length > 1 && (
            <View style={styles.switcherRow}>
              {linkedCases.map((c, index) => (
                <Pressable
                  key={c.userId}
                  onPress={() => setSelectedUserId(c.userId)}
                  style={[
                    styles.switcherPill,
                    c.userId === activeUserId && styles.switcherPillActive,
                  ]}
                >
                  <Text style={[styles.switcherPillText, c.userId === activeUserId && styles.switcherPillTextActive]}>
                    Docket {c.docketNumber || index + 1}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <InvestigationProgressCard data={investigationQuery.data} />

          {!activeUserId ? (
            <EmptyState icon="file-text" message="No case found for your account yet." />
          ) : (
            <QueryBoundary query={courtQuery}>
              {(data) => {
                if (!data?.available) {
                  return (
                    <EmptyState
                      icon="clock"
                      title="Not yet available"
                      message={data?.reason || 'Court case details aren’t available for this case yet.'}
                    />
                  );
                }

                const hasIaOrOther = (data.iaDetails?.length > 0) || (data.connectedCases?.length > 0)
                  || (data.transferHistory?.length > 0) || (data.objections?.length > 0) || data.originatingCaseNumber;

                return (
                  <>
                    {/* Case Overview Panel */}
                    <View style={styles.overviewCard}>
                      <Text style={styles.overviewHeaderTitle}>CASE OVERVIEW</Text>

                      <View style={styles.overviewContainer}>
                        <View style={styles.overviewGridRow}>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>CNR Number</Text>
                            <Text style={styles.overviewValue}>{data.cnrNumber}</Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Case Type</Text>
                            <Text style={styles.overviewValue}>{data.caseType}</Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Category</Text>
                            <Text style={styles.overviewValue}>{data.caseCategory}</Text>
                          </View>
                        </View>

                        <View style={styles.overviewGridRow}>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Filing No. / Date</Text>
                            <Text style={styles.overviewValue}>
                              {data.filingNumber ? `${data.filingNumber} (${formatDate(data.filingDate)})` : null}
                            </Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Registration No. / Date</Text>
                            <Text style={styles.overviewValue}>
                              {data.registrationNumber ? `${data.registrationNumber} (${formatDate(data.registrationDate)})` : null}
                            </Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Court Complex</Text>
                            <Text style={styles.overviewValue}>{data.courtComplex}</Text>
                          </View>
                        </View>

                        <View style={styles.overviewGridRow}>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Court Establishment</Text>
                            <Text style={styles.overviewValue}>{data.courtEstablishment}</Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Court Number</Text>
                            <Text style={styles.overviewValue}>{data.courtNumber}</Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Coram</Text>
                            <Text style={styles.overviewValue}>{data.coram?.join(', ')}</Text>
                          </View>
                        </View>

                        <View style={styles.overviewGridRow}>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Case Stage</Text>
                            <Text style={styles.overviewValue}>{data.caseStageLabel}</Text>
                          </View>
                          <View style={styles.overviewGridCell}>
                            <Text style={styles.overviewLabel}>Status</Text>
                            <Text style={styles.overviewValue}>{data.caseStatus}</Text>
                          </View>
                          {data.caseStatus === 'Disposed' ? (
                            <View style={styles.overviewGridCell}>
                              <Text style={styles.overviewLabel}>Decision Date</Text>
                              <Text style={styles.overviewValue}>{formatDate(data.decisionDate)}</Text>
                            </View>
                          ) : (
                            <View style={styles.overviewGridCell} />
                          )}
                        </View>

                        {data.caseStatus === 'Disposed' && (
                          <View style={styles.overviewGridRow}>
                            <View style={styles.overviewGridCell}>
                              <Text style={styles.overviewLabel}>Disposal Nature</Text>
                              <Text style={styles.overviewValue}>{data.disposalNature}</Text>
                            </View>
                            <View style={styles.overviewGridCell} />
                            <View style={styles.overviewGridCell} />
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Parties & Advocates */}
                    <View style={styles.cardContainer}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.cardHeaderLeft}>
                          <View style={styles.cardHeaderIconTile}>
                            <Feather name="users" size={18} color="#3B82F6" />
                          </View>
                          <View>
                            <Text style={styles.cardTitle}>Parties & Advocates</Text>
                            <Text style={styles.cardSubTitle}>People involved in the case and their roles.</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.cardContent}>
                        <View style={styles.innerPanelContainer}>
                          <View style={isDesktop ? styles.partiesGrid : styles.fullWidth}>
                            <PartyList icon="home" title="Petitioner" pillBg="#DBEAFE" pillFg="#1E40AF" parties={data.petitionerNames} />
                            <PartyList icon="user" title="Respondent" pillBg="#F3E8FF" pillFg="#6B21A8" parties={data.respondentNames} />
                            <PartyList icon="users" title="Advocates" pillBg="#DCFCE7" pillFg="#15803D" parties={data.advocateNames} isLast />
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Next Hearing */}
                    {data.caseStatus !== 'Disposed' && (
                      <View style={styles.cardContainer}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.cardHeaderLeft}>
                            <View style={styles.cardHeaderIconTile}>
                              <Feather name="calendar" size={18} color="#3B82F6" />
                            </View>
                            <View>
                              <Text style={styles.cardTitle}>Next Hearing</Text>
                              <Text style={styles.cardSubTitle}>Upcoming court proceedings and schedule.</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.cardContent}>
                          <View style={styles.innerPanelContainer}>
                            <View style={styles.hearingGridRow}>
                              <HearingGridCell icon="calendar" label="Date" value={formatDate(data.nextHearingDate)} />
                              <HearingGridCell icon="clock" label="First Hearing" value={formatDate(data.firstHearingDate)} isLast />
                            </View>
                            <View style={[styles.hearingGridRow, { borderTopWidth: 1, borderTopColor: '#EBF1F6' }]}>
                              <HearingGridCell icon="help-circle" label="Purpose" value={data.nextHearingPurpose} />
                              <HearingGridCell icon="video" label="Hearing Mode" value={data.hearingMode} isLast />
                            </View>
                          </View>
                        </View>
                      </View>
                    )}

                    {/* Acts, Sections & FIR */}
                    <View style={styles.cardContainer}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.cardHeaderLeft}>
                          <View style={styles.cardHeaderIconTile}>
                            <Feather name="book-open" size={18} color="#3B82F6" />
                          </View>
                          <View>
                            <Text style={styles.cardTitle}>Acts, Sections & FIR</Text>
                            <Text style={styles.cardSubTitle}>Legal classifications and station info.</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.cardContent}>
                        <View style={styles.innerPanelContainer}>
                          <View style={styles.actsListSection}>
                            {data.actsSections?.map((a, i) => (
                              <Text key={i} style={styles.listItem}>{'•'} {a}</Text>
                            ))}
                          </View>
                          <View style={styles.firGridRow}>
                            <HearingGridCell icon="shield" label="Police Station" value={data.firPoliceStation} />
                            <HearingGridCell icon="file-text" label="FIR Number" value={data.firNumber} />
                            <HearingGridCell icon="calendar" label="FIR Year" value={data.firYear} isLast />
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Interlocutory Applications */}
                    {data.iaDetails?.length > 0 && (
                      <View style={styles.cardContainer}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.cardHeaderLeft}>
                            <View style={styles.cardHeaderIconTile}>
                              <Feather name="layers" size={18} color="#3B5998" />
                            </View>
                            <View>
                              <Text style={styles.cardTitle}>Interlocutory Applications (Incl. Bail)</Text>
                              <Text style={styles.cardSubTitle}>Interim petitions and filings.</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.cardContent}>
                          {data.iaDetails.map((ia, i) => (
                            <View key={i} style={styles.iaItem}>
                              <Text style={styles.iaType}>{ia.iaType} <Text style={styles.iaStatus}>({ia.status})</Text></Text>
                              <Text style={styles.iaMeta}>{ia.iaNumber} · filed {formatDate(ia.filingDate)}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Hearing History */}
                    {data.hearingHistory?.length > 0 && (
                      <View style={styles.cardContainer}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.cardHeaderLeft}>
                            <View style={styles.cardHeaderIconTile}>
                              <Feather name="clock" size={18} color="#3B5998" />
                            </View>
                            <View>
                              <Text style={styles.cardTitle}>Hearing History</Text>
                              <Text style={styles.cardSubTitle}>Past court dates and outcomes.</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.cardContent}>
                          {data.hearingHistory.slice().reverse().map((h, i) => (
                            <View key={i} style={styles.historyItem}>
                              <Text style={styles.historyDate}>{formatDate(h.date)}</Text>
                              <Text style={styles.historyBusiness}>{h.business}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Orders & Judgments */}
                    {data.orders?.length > 0 && (
                      <View style={styles.cardContainer}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.cardHeaderLeft}>
                            <View style={styles.cardHeaderIconTile}>
                              <Feather name="file" size={18} color="#3B5998" />
                            </View>
                            <View>
                              <Text style={styles.cardTitle}>Orders & Judgments</Text>
                              <Text style={styles.cardSubTitle}>Issued legal decrees and records.</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.cardContent}>
                          {data.orders.slice().reverse().map((o, i) => (
                            <View key={i} style={styles.historyItem}>
                              <Feather name={o.type === 'Judgment' ? 'award' : 'file'} size={14} color="#3B5998" style={{ marginRight: spacing.xs }} />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.historyBusiness}>{o.title}</Text>
                                <Text style={styles.historyDate}>{formatDate(o.date)}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}

                    {/* Other Details */}
                    {hasIaOrOther && (
                      <View style={styles.cardContainer}>
                        <View style={styles.cardHeaderRow}>
                          <View style={styles.cardHeaderLeft}>
                            <View style={styles.cardHeaderIconTile}>
                              <Feather name="grid" size={18} color="#3B5998" />
                            </View>
                            <View>
                              <Text style={styles.cardTitle}>Other Details</Text>
                              <Text style={styles.cardSubTitle}>Additional legal metadata.</Text>
                            </View>
                          </View>
                        </View>
                        <View style={styles.cardContent}>
                          <Row label="Originating Case No." value={data.originatingCaseNumber} />
                          <Row label="Connected Cases" value={data.connectedCases?.join(', ')} />
                          <Row label="Transfer History" value={data.transferHistory?.length ? `${data.transferHistory.length} transfer(s) on record` : null} />
                          <Row label="Objections" value={data.objections?.length ? `${data.objections.length} objection(s) raised` : null} />
                        </View>
                      </View>
                    )}

                    {/* Disclaimer Banner */}
                    <View style={styles.infoBanner}>
                      <View style={styles.infoIconTile}>
                        <Feather name="info" size={16} color="#3B82F6" />
                      </View>
                      <Text style={styles.disclaimer}>{data.note}</Text>
                    </View>
                  </>
                );
              }}
            </QueryBoundary>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollView: { flex: 1, backgroundColor: '#F8FAFC' },
  topHeader: {
    backgroundColor: colors.primaryLight,
    paddingTop: Platform.OS === 'ios' ? 48 : spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topHeaderDesktop: { height: 64, paddingTop: 0, paddingBottom: 0 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: { marginRight: spacing.sm, padding: spacing.xs },
  headerIconTile: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  headerTitle: { ...typography.h1, color: colors.primaryDark, fontSize: 20, fontWeight: '700' },
  body: { width: '100%', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, maxWidth: 1080, alignSelf: 'center' },

  switcherRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, flexWrap: 'wrap' },
  switcherPill: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  switcherPillActive: {
    backgroundColor: '#3B5998',
    borderColor: '#3B5998',
  },
  switcherPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  switcherPillTextActive: {
    color: '#FFFFFF',
  },

  /* Overview Box */
  overviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EBF1F6',
    marginBottom: spacing.lg,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  overviewHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#8E9BAE',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  overviewContainer: {
    width: '100%',
    backgroundColor: '#F5F8FF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E8F0FE',
  },
  overviewGridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EEF9',
  },
  overviewGridCell: {
    flex: 1,
    paddingRight: 8,
  },
  overviewLabel: {
    fontSize: 12,
    color: '#8E9BAE',
    fontWeight: '500',
    marginBottom: 4,
  },
  overviewValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B5998',
  },

  /* Section Cards */
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EBF1F6',
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 8,
    elevation: 1,
    overflow: 'hidden',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardHeaderIconTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  cardSubTitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  cardContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },

  innerPanelContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EBF1F6',
    overflow: 'hidden',
  },

  /* Parties Grid */
  partiesGrid: {
    flexDirection: 'row',
  },
  partyColumn: {
    flex: 1,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: '#EBF1F6',
  },
  partyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  partyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  partyPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  partyTextContainer: {
    marginVertical: 2,
  },
  partyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  partyRole: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748B',
  },

  /* Hearing Grid */
  hearingGridRow: {
    flexDirection: 'row',
  },
  hearingCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: '#EBF1F6',
  },
  hearingIconTile: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hearingTextContainer: {
    flex: 1,
  },
  hearingLabel: {
    fontSize: 12,
    color: '#8E9BAE',
    fontWeight: '500',
    marginBottom: 2,
  },
  hearingValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },

  /* Acts & FIR */
  actsListSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBF1F6',
  },
  firGridRow: {
    flexDirection: 'row',
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressText: {
    fontSize: 13,
    color: '#334155',
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  documentRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  documentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  documentBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B5998',
  },
  fullWidth: {
    width: '100%',
  },
  listItem: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '500',
    paddingVertical: 2,
  },
  iaItem: {
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  iaType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  iaStatus: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '400',
  },
  iaMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  historyDate: {
    fontSize: 12,
    color: '#64748B',
    width: 90,
  },
  historyBusiness: {
    fontSize: 13,
    color: '#1E293B',
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: spacing.md,
    borderRadius: 12,
    gap: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  infoIconTile: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclaimer: {
    fontSize: 12,
    color: '#1E40AF',
    flex: 1,
  },
});