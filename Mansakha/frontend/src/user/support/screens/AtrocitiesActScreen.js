import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, LayoutAnimation, Platform, UIManager, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { spacing } from '../../shared/theme/spacing';
import { radius } from '../../shared/theme/radius';
import { colors } from '../../shared/theme/colors';
import { typography } from '../../shared/theme/typography';
import { useResponsive } from '../../shared/hooks/useResponsive';
import { useUserDashboard } from '../../shared/services/hooks';
import TopRightActions from '../../shared/components/TopRightActions';
import DesktopHeaderActions from '../../shared/components/DesktopHeaderActions';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const SUMMARY_POINTS = [
  { 
    id: '1',
    label: 'What is this Act?', 
    icon: 'file-text',
    text: 'A law passed by the Parliament of India (Act No. 33 of 1989, in force since 1990) to prevent atrocities against Scheduled Caste and Scheduled Tribe communities, and to provide relief and rehabilitation for victims.' 
  },
  { 
    id: '2',
    label: 'Who is it for?', 
    icon: 'users',
    text: 'Members of Scheduled Castes (SC) and Scheduled Tribes (ST) who face violence, humiliation, or discrimination because of their caste or tribal identity.' 
  },
  { 
    id: '3',
    label: 'What provisions it provides?', 
    icon: 'shield',
    text: 'Defines specific acts as punishable "atrocities" (Chapter II), allows removing a likely offender from an area (Chapter III - "Externment"), sets up Special Courts for faster trials (Chapter IV), and covers relief, rehabilitation, and implementation duties for the Government (Chapter V).' 
  },
  { 
    id: '4',
    label: 'Special Courts', 
    icon: 'briefcase',
    text: 'Each district gets a designated Court of Session as a Special Court, with a Special Public Prosecutor, so cases under this Act are tried faster than in a regular court.' 
  },
  { 
    id: '5',
    label: "Victims' rights", 
    icon: 'user-check',
    text: "Legal aid, travel and maintenance expenses during investigation and trial, and economic/social rehabilitation are duties the Government must provide under Section 21." 
  },
  { 
    id: '6',
    label: 'Anticipatory bail', 
    icon: 'scale',
    text: 'Anticipatory bail is not allowed in cases registered under this Act.' 
  },
  { 
    id: '7',
    label: 'Later amendments', 
    icon: 'edit-3',
    text: 'The 2015 and 2018 amendments (not shown in the original 1989 text below) added more offences and restored certain victim/witness safeguards.' 
  },
];

const PREAMBLE = `THE SCHEDULED CASTES AND THE SCHEDULED TRIBES
(PREVENTION OF ATROCITIES) ACT, 1989
(No. 33 of 1989)
[11th September, 1989]

An Act to prevent the commission of offences of atrocities against the members of the Scheduled Castes and the Scheduled Tribes, to provide for Special Courts for the trial of such offences and for the relief and rehabilitation of the victims of such offences and for matters connected therewith or incidental thereto.

Be it enacted by Parliament in the Fortieth Year of the Republic of India as follows:-`;

const CHAPTERS = [
  {
    title: 'CHAPTER I — PRELIMINARY',
    body: `Short title, extent and commencement.-
1. (1) This Act may be called the Scheduled Castes and the Scheduled Tribes (Prevention of Atrocities) Act, 1989.
(2) It extends to the whole of India except the State of Jammu and Kashmir.
(3) It shall come into force on such date as the Central Government may, by notification in the official Gazette, appoint.

Definitions.-
2. (1) In this Act unless the context otherwise requires,
(a) "atrocity" means an offence punishable under section 3;
(b) "Code" means the Code of Criminal Procedure, 1973 (2 of 1974);
(c) "Scheduled Castes and Scheduled Tribes" shall have the meanings assigned to them respectively under clause (25) of article 366 of the Constitution;
(d) "Special Court" means a Court of Session specified as a Special Court in section 14;
(e) "Special Public Prosecutor" means a Public Prosecutor specified as a Special Public Prosecutor or an advocate referred to in section 15;
(f) words and expressions used but not defined in this Act and defined in the Code or the Indian Penal Code (45 of 1860) shall have the meanings assigned to them respectively in the Code, or as the case may be, in the Indian Penal Code.
(2) Any reference in this Act to any enactment or any provision thereof shall, in relation to an area in which such enactment or such provision is not in force, be construed as a reference to the corresponding law, if any, in force in that area.`,
  },
  {
    title: 'CHAPTER II — OFFENCES OF ATROCITIES',
    body: `Punishments for offences of atrocities.-
3. (1) Whoever, not being a member of a Scheduled Caste or a Scheduled Tribe,-
(i) forces a member of a Scheduled Caste or a Scheduled Tribe to drink or eat any inedible or obnoxious substance;
(ii) acts with intent to cause injury, insult or annoyance to any member of a Scheduled Caste or a Scheduled Tribe by dumping excreta, waste matter, carcasses or any other obnoxious substance in his premises or neighbourhood;
(iii) forcibly removes clothes from the person of a member of a Scheduled Caste or a Scheduled Tribe or parades him naked or with painted face or body or commits any similar act which is derogatory to human dignity;
(iv) wrongfully occupies or cultivates any land owned by, or allotted to, or notified by any competent authority to be allotted to, a member of a Scheduled Caste or a Scheduled Tribe or gets the land allotted to him transferred;
(v) wrongfully dispossesses a member of a Scheduled Caste or a Scheduled Tribe from his land or premises or interferes with the enjoyment of his rights over any land, premises or water;
(vi) compels or entices a member of a Scheduled Caste or a Scheduled Tribe to do "begar" or other similar forms of forced or bonded labour other than any compulsory service for public purposes imposed by Government;
(vii) forces or intimidates a member of a Scheduled Caste or a Scheduled Tribe not to vote or to vote to a particular candidate or to vote in a manner other than that provided by law;
(viii) institutes false, malicious or vexatious suit or criminal or other legal proceedings against a member of a Scheduled Caste or a Scheduled Tribe;
(ix) gives any false or frivolous information to any public servant and thereby causes such public servant to use his lawful power to the injury or annoyance of a member of a Scheduled Caste or a Scheduled Tribe;
(x) intentionally insults or intimidates with intent to humiliate a member of a Scheduled Caste or a Scheduled Tribe in any place within public view;
(xi) assaults or uses force to any woman belonging to a Scheduled Caste or a Scheduled Tribe with intent to dishonour or outrage her modesty;
(xii) being in a position to dominate the will of a woman belonging to a Scheduled Caste or a Scheduled Tribe and uses that position to exploit her sexually to which she would not have otherwise agreed;
(xiii) corrupts or fouls the water of any spring, reservoir or any other source ordinarily used by members of the Scheduled Castes or the Scheduled Tribes so as to render it less fit for the purpose for which it is ordinarily used;
(xiv) denies a member of a Scheduled Caste or a Scheduled Tribe any customary right of passage to a place of public resort or obstructs such member so as to prevent him from using or having access to a place of public resort to which other members of the public or any section thereof have a right to use or access to;
(xv) forces or causes a member of a Scheduled Caste or a Scheduled Tribe to leave his house, village or other place of residence,
shall be punishable with imprisonment for a term which shall not be less than six months but which may extend to five years and with fine.

(2) Whoever, not being a member of a Scheduled Caste or a Scheduled Tribe,-
(i) gives or fabricates false evidence intending thereby to cause, or knowing it to be likely that he will thereby cause, any member of a Scheduled Caste or a Scheduled Tribe to be convicted of an offence which is capital by the law for the time being in force shall be punished with imprisonment for life and with fine; and if an innocent member of a Scheduled Caste or a Scheduled Tribe be convicted and executed in consequence of such false or fabricated evidence, the person who gives or fabricates such evidence, shall be punished with death;
(ii) gives or fabricates false evidence intending thereby to cause, or knowing it to be likely that he will thereby cause, any member of a Scheduled Caste or a Scheduled Tribe to be convicted of an offence which is not capital but punishable with imprisonment for a term of seven years or upwards, shall be punishable with imprisonment for a term which shall not be less than six months but which may extend to seven years or upwards and with fine;
(iii) commits mischief by fire or any explosive substance intending to cause or knowing it to be likely that he will thereby cause damage to any property belonging to a member of a Scheduled Caste or a Scheduled Tribe, shall be punishable with imprisonment for a term which shall not be less than six months but which may extend to seven years and with fine;
(iv) commits mischief by fire or any explosive substance intending to cause or knowing it to be likely that he will thereby cause destruction of any building which is ordinarily used as a place of worship or as a place for human dwelling or as a place for custody of the property by a member of a Scheduled Caste or a Scheduled Tribe, shall be punishable with imprisonment for life and with fine;
(v) commits any offence under the Indian Penal Code (45 of 1860) punishable with imprisonment for a term of ten years or more against a person or property on the ground that such person is a member of a Scheduled Caste or a Scheduled Tribe or such property belongs to such member, shall be punishable with imprisonment for life and with fine;
(vi) knowingly or having reason to believe that an offence has been committed under this Chapter, causes any evidence of the commission of that offence to disappear with the intention of screening the offender from legal punishment, or with that intention gives any information respecting the offence which he knows or believes to be false, shall be punishable with the punishment provided for that offence; or
(vii) being a public servant, commits any offence under this section, shall be punishable with imprisonment for a term which shall not be less than one year but which may extend to the punishment provided for that offence.

Punishment for neglect of duties.-
4. Whoever, being a public servant but not being a member of a Scheduled Caste or a Scheduled Tribe, wilfully neglects his duties required to be performed by him under this Act, shall be punishable with imprisonment for a term which shall not be less than six months but which may extend to one year.

Enhanced punishment for subsequent conviction.-
5. Whoever, having already been convicted of an offence under this Chapter is convicted for the second offence or any offence subsequent to the second offence, shall be punishable with imprisonment for a term which shall not be less than one year but which may extend to the punishment provided for that offence.

Application of certain provisions of the Indian Penal Code.-
6. Subject to the other provisions of this Act, the provisions of section 34, Chapter III, Chapter IV, Chapter VA, section 149 and Chapter XXIII of the Indian Penal Code (45 of 1860), shall, so far as may be, apply for the purposes of this Act as they apply for the purposes of the Indian Penal Code.

Forfeiture of property of certain persons.-
7. (1) Where a person has been convicted of any offence punishable under this Chapter, the Special Court may, in addition to awarding any punishment, by order in writing, declare that any property, movable or immovable or both, belonging to the person, which has been used for the commission of that offence, shall stand forfeited to Government.
(2) Where any person is accused of any offence under this Chapter, it shall be open to the Special Court trying him to pass an order that all or any of the properties, movable or immovable or both, belonging to him, shall, during the period of such trial, be attached, and where such trial ends in conviction, the property so attached shall be liable to forfeiture to the extent it is required for the purpose of realisation of any fine imposed under this Chapter.

Presumption as to offences.-
8. In a prosecution for an offence under this Chapter, if it is proved that -
(a) the accused rendered any financial assistance to a person accused of, or reasonably suspected of committing, an offence under this Chapter, the Special Court shall presume, unless the contrary is proved, that such person had abetted the offence;
(b) a group of persons committed an offence under this Chapter and if it is proved that the offence committed was a sequel to any existing dispute regarding land or any other matter, it shall be presumed that the offence was committed in furtherance of the common intention or in prosecution of the common object.

Conferment of powers.-
9. (1) Notwithstanding anything contained in the Code or in any other provision of this Act, the State Government may, if it considers it necessary or expedient so to do,-
(a) for the prevention of and for coping with any offence under this Act, or
(b) for any case or class or group of cases under this Act,
in any district or part thereof, confer, by notification in the Official Gazette, on any officer of the State Government, the powers exercisable by a police officer under the Code in such district or part thereof or, as the case may be, for such case or class or group of cases, and in particular, the powers of arrest, investigation and prosecution of persons before any Special Court.
(2) All officers of police and all other officers of Government shall assist the officer referred to in sub-section (1) in the execution of the provisions of this Act or any rule, scheme or order made thereunder.
(3) The provisions of the Code shall, so far as may be, apply to the exercise of the powers by an officer under sub-section (1).`,
  },
  {
    title: 'CHAPTER III — EXTERNMENT',
    body: `Removal of person likely to commit offence.-
10. (1) Where the Special Court is satisfied, upon a complaint or a police report that a person is likely to commit an offence under Chapter II of this Act in any area included in "Scheduled Areas" or "tribal areas", as referred to in article 244 of the Constitution, it may, by order in writing, direct such person to remove himself beyond the limits of such area, by such route and within such time as may be specified in the order, and not to return to that area from which he was directed to remove himself for such period, not exceeding two years, as may be specified in the order.
(2) The Special Court shall, along with the order under sub-section (1), communicate to the person directed under that sub-section the grounds on which such order has been made.
(3) The Special Court may revoke or modify the order made under sub-section (1), for the reasons to be recorded in writing, on the representation made by the person against whom such order has been made or by any other person on his behalf within thirty days from the date of the order.

Procedure on failure of person to remove himself from area and enter thereon after removal.-
11. (1) If a person to whom a direction has been issued under section 10 to remove himself from any area-
(a) fails to remove himself as directed; or
(b) having so removed himself enters such area within the period specified in the order,
otherwise than with the permission in writing of the Special Court under sub-section (2), the Special Court may cause him to be arrested and removed in police custody to such place outside such area as the Special Court may specify.
(2) The Special Court may, by order in writing, permit any person in respect of whom an order under section 10 has been made, to return to the area from which he was directed to remove himself for such temporary period and subject to such conditions as may be specified in such order and may require him to execute a bond with or without surety for the due observation of the conditions imposed.
(3) The Special Court may at any time revoke any such permission.
(4) Any person who, with such permission, returns to the area from which he was directed to remove himself shall observe the conditions imposed, and at the expiry of the temporary period for which he was permitted to return, or on the revocation of such permission before the expiry of such temporary period, shall remove himself outside such area and shall not return thereto within the unexpired portion specified under section 10 without a fresh permission.
(5) If a person fails to observe any of the conditions imposed or to remove himself accordingly or having so removed himself enters or returns to such area without fresh permission the Special Court may cause him to be arrested and removed in police custody to such place outside such area as the Special Court may specify.

Taking measurements and photographs etc., of persons against whom order under section 10 is made.-
12. (1) Every person against whom an order has been made under section 10 shall, if so required by the Special Court, allow his measurements and photographs to be taken by a police officer.
(2) If any person referred to in sub-section (1), when required to allow his measurements or photographs to be taken resists or refuses to allow the taking of such measurements or photographs, it shall be lawful to use all necessary means to secure the taking thereof.
(3) Resistance to or refusal to allow the taking of measurements or photographs under sub-section (2) shall be deemed to be an offence under section 186 of the Indian Penal Code (45 of 1860).
(4) Where an order under section 10 is revoked, all measurements and photographs (including negatives) taken under sub-section (2) shall be destroyed or made over to the person against whom such order is made.

Penalty for non-compliance of order under section 10.-
13. Any person contravening an order of the Special Court made under section 10 shall be punishable with imprisonment for a term which may extend to one year and with fine.`,
  },
  {
    title: 'CHAPTER IV — SPECIAL COURTS',
    body: `Special Court.-
14. For the purpose of providing for speedy trial, the State Government shall, with the concurrence of the Chief Justice of the High Court, by notification in the Official Gazette, specify for each district a Court of Session to be a Special Court to try the offences under this Act.

Special Public Prosecutor.-
15. For every Special Court, the State Government shall, by notification in the Official Gazette, specify a Public Prosecutor or appoint an advocate who has been in practice as an advocate for not less than seven years, as a Special Public Prosecutor for the purpose of conducting cases in that Court.`,
  },
  {
    title: 'CHAPTER V — MISCELLANEOUS',
    body: `Power of State Government to impose collective fine.-
16. The provisions of section 10A of the Protection of Civil Rights Act, 1955 (22 of 1955) shall, so far as may be, apply for the purposes of imposition and realisation of collective fine and for all other matters connected therewith under this Act.

Preventive action to be taken by the law and order machinery.-
17. (1) A District Magistrate or a Sub-divisional Magistrate or any other Executive Magistrate or any police officer not below the rank of a Deputy Superintendent of Police may, on receiving information and after such inquiry as he may think necessary, has reason to believe that a person or a group of persons not belonging to the Scheduled Castes or the Scheduled Tribes, residing in or frequenting any place within the local limits of his jurisdiction is likely to commit an offence or has threatened to commit any offence under this Act and is of the opinion that there is sufficient ground for proceeding, declare such an area to be an area prone to atrocities and take necessary action for keeping the peace and good behaviour and maintenance of public order and tranquility and may take preventive action.
(2) The provisions of Chapters VIII, X and XI of the Code shall, so far as may be, apply for the purposes of sub-section (1).
(3) The State Government may, by notification in the Official Gazette, make one or more schemes specifying the manner in which the officers referred to in sub-section (1) shall take appropriate action specified in such scheme or schemes to prevent atrocities and to restore the feeling of security amongst the members of the Scheduled Castes and the Scheduled Tribes.

Section 438 of the Code not to apply to persons committing an offence under the Act.-
18. Nothing in section 438 of the Code shall apply in relation to any case involving the arrest of any person on an accusation of having committed an offence under this Act.

Section 360 of the Code or the provisions of the Probation of Offenders Act not to apply to persons guilty of an offence under the Act.-
19. The provisions of section 360 of the Code and the provisions of the Probation of Offenders Act, 1958 (20 of 1958) shall not apply to any person above the age of eighteen years who is found guilty of having committed an offence under this Act.

Act to override other laws.-
20. Save as otherwise provided in this Act, the provisions of this Act shall have effect notwithstanding anything inconsistent therewith contained in any other law for the time being in force or custom or usage or any instrument having effect by virtue of any such law.

Duty of Government to ensure effective implementation of the Act.-
21. (1) Subject to such rules as the Central Government may make in this behalf, the State Government shall take such measures as may be necessary for the effective implementation of this Act.
(2) In particular, and without prejudice to the generality of the foregoing provisions, such measures may include -
(i) the provision for adequate facilities, including legal aid, to the persons subjected to atrocities to enable them to avail themselves of justice;
(ii) the provision for travelling and maintenance expenses to witnesses, including the victims of atrocities, during investigation and trial of offences under this Act;
(iii) the provision for the economic and social rehabilitation of the victims of the atrocities;
(iv) the appointment of officers for initiating or exercising supervision over prosecutions for the contravention of the provisions of this Act;
(v) the setting up of committees at such appropriate levels as the State Government may think fit to assist that Government in formulation or implementation of such measures;
(vi) provision for a periodic survey of the working of the provisions of this Act with a view to suggesting measures for the better implementation of the provisions of this Act;
(vii) the identification of the areas where the members of the Scheduled Castes and the Scheduled Tribes are likely to be subjected to atrocities and adoption of such measures so as to ensure safety for such members.
(3) The Central Government shall take such steps as may be necessary to co-ordinate the measures taken by the State Governments under sub-section (1).
(4) The Central Government shall, every year, place on the table of each House of Parliament a report on the measures taken by itself and by the State Governments in pursuance of the provisions of this section.

Protection of action taken in good faith.-
22. No suit, prosecution or other legal proceedings shall lie against the Central Government or against the State Government or any officer or authority of Government or any other person for anything which is in good faith done or intended to be done under this Act.`,
  },
];

export default function AtrocitiesActScreen({ navigation }) {
  const [openId, setOpenId] = useState(null);
  const { isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();

  // Fetch user profile data for DesktopHeaderActions (matching JournalScreen pattern)
  const dashboardQuery = useUserDashboard();
  const userData = dashboardQuery?.data;

  const toggleFaq = (id) => {
    if (Platform.OS !== 'web') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Top Header — Updated to match JournalScreen pattern */}
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
            <Feather name="book-open" size={22} color={colors.primaryDark} />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>Prevention of Atrocities Act</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {isDesktop ? (
            <DesktopHeaderActions
              fullName={userData?.fullName}
              alertCount={userData?.alerts?.length || 0}
              onBellPress={() => {}}
            />
          ) : (
            <TopRightActions />
          )}
        </View>
      </View>

      <View style={styles.body}>
        {/* Hero Section */}
        <View style={styles.bannerContainer}>
          <View style={styles.bannerIconBox}>
            <Image 
              source={require('../../../../assets/justice.png')} 
              style={styles.bannerImage} 
              resizeMode="contain"
            />
          </View>

          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>
              A law to protect dignity, ensure justice, and build an equal and safe society for all.
            </Text>
            <Text style={styles.bannerSubtitle}>Act No. 33 of 1989, enforced since 1990</Text>
          </View>

          <View style={styles.bannerRightIconBox}>
            <Feather name="shield" size={28} color="rgba(255, 255, 255, 0.25)" />
          </View>
        </View>

        {/* KEY HIGHLIGHTS / FAQs */}
        <Text style={styles.sectionHeader}>KEY HIGHLIGHTS</Text>

        {SUMMARY_POINTS.map((point) => {
          const isOpen = openId === point.id;
          return (
            <View key={point.id} style={styles.faqCard}>
              <Pressable onPress={() => toggleFaq(point.id)} style={styles.faqHeader}>
                <View style={styles.cardIconBox}>
                  <Feather name={point.icon} size={18} color={colors.primaryDark} />
                </View>

                <View style={styles.faqTitleContainer}>
                  <Text style={styles.cardTitle}>{point.label}</Text>
                </View>

                <Feather 
                  name={isOpen ? 'chevron-down' : 'chevron-right'} 
                  size={20} 
                  color={colors.textSecondary} 
                  style={styles.chevron} 
                />
              </Pressable>

              {isOpen && (
                <View style={styles.faqBodyContainer}>
                  <Text style={styles.cardBody}>{point.text}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Full Text Section */}
        <Text style={[styles.sectionHeader, { marginTop: spacing.xl }]}>FULL TEXT OF THE ACT</Text>
        <View style={styles.actCard}>
          <Text style={styles.preambleText}>{PREAMBLE}</Text>
        </View>
        {CHAPTERS.map((chapter) => (
          <View key={chapter.title} style={styles.actCard}>
            <Text style={styles.chapterTitle}>{chapter.title}</Text>
            <Text style={styles.actBodyText}>{chapter.body}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.background,
  },
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
  topHeaderDesktop: {
    height: 64,
    paddingTop: 0,
    paddingBottom: 0,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerRight: { marginLeft: spacing.md },
  backBtn: {
    marginRight: spacing.sm,
    padding: spacing.xs,
  },
  headerIconTile: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  statusTitle: { 
    ...typography.h1,
    color: colors.primaryDark,
    fontSize: 20, 
    fontWeight: '700', 
  },
  body: { 
    width: '100%', 
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  bannerContainer: {
    backgroundColor: colors.sidebarBg,
    borderRadius: radius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
    width: '100%',
  },
  bannerIconBox: {
    width: 60,
    height: 60,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  bannerImage: {
    width: 70,
    height: 70,
  },
  bannerRightIconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    ...typography.bodyStrong,
    color: colors.sidebarTextActive,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: spacing.xs,
  },
  bannerSubtitle: {
    ...typography.caption,
    color: colors.sidebarText,
    fontSize: 12,
  },
  sectionHeader: {
    ...typography.h3,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDark,
    marginBottom: spacing.md,
    letterSpacing: 1,
  },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
    width: '100%',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  cardIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  faqTitleContainer: {
    flex: 1,
  },
  cardTitle: { 
    ...typography.bodyStrong,
    fontSize: 14, 
    fontWeight: '700', 
    color: colors.textPrimary,
  },
  faqBodyContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  cardBody: { 
    ...typography.caption,
    fontSize: 13, 
    color: colors.textSecondary, 
    lineHeight: 20 
  },
  chevron: {
    marginLeft: spacing.sm,
  },
  actCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    width: '100%',
  },
  preambleText: { 
    ...typography.bodySmall,
    fontSize: 13, 
    color: colors.textPrimary, 
    lineHeight: 20 
  },
  chapterTitle: { 
    ...typography.h3,
    fontSize: 14, 
    fontWeight: '700', 
    color: colors.primaryDark, 
    marginBottom: spacing.sm, 
    letterSpacing: 0.5 
  },
  actBodyText: { 
    ...typography.caption,
    fontSize: 13, 
    color: colors.textSecondary, 
    lineHeight: 20 
  },
});