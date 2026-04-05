/**
 * SPEAQ - Onboarding Screen
 * Swipeable intro slides explaining SPEAQ features
 * Shown once before WelcomeScreen
 */

import React, { useState, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Dimensions } from "react-native";
import { colors } from "../theme/brand";
import { t } from "../services/i18n";

const { width } = Dimensions.get("window");

interface Props {
  onDone: () => void;
}

function getSlides() {
  return [
    { icon: "Q", title: t("onb1Title"), subtitle: t("onb1Sub") },
    { icon: "C", title: t("onb2Title"), subtitle: t("onb2Sub") },
    { icon: "$", title: t("onb3Title"), subtitle: t("onb3Sub") },
    { icon: "G", title: t("onb4Title"), subtitle: t("onb4Sub") },
    { icon: "M", title: t("onb5Title"), subtitle: t("onb5Sub") },
  ];
}

export default function OnboardingScreen({ onDone }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const SLIDES = getSlides();

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      onDone();
    }
  }

  const renderSlide = ({ item }: { item: typeof SLIDES[0] }) => (
    <View style={[st.slide, { width }]}>
      <View style={st.iconCircle}>
        <Text style={st.iconText}>{item.icon}</Text>
      </View>
      <Text style={st.slideTitle}>{item.title}</Text>
      <Text style={st.slideSubtitle}>{item.subtitle}</Text>
    </View>
  );

  return (
    <View style={st.container}>
      <TouchableOpacity style={st.skipBtn} onPress={onDone}>
        <Text style={st.skipText}>{t("skip")}</Text>
      </TouchableOpacity>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => i.toString()}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
      />

      {/* Dots */}
      <View style={st.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[st.dot, i === currentIndex && st.dotActive]} />
        ))}
      </View>

      {/* Next / Get Started */}
      <TouchableOpacity style={st.nextBtn} onPress={handleNext}>
        <Text style={st.nextText}>
          {currentIndex === SLIDES.length - 1 ? t("getStarted") : t("next")}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.depth.void, alignItems: "center" },
  skipBtn: { position: "absolute", top: 60, right: 24, zIndex: 10 },
  skipText: { color: colors.signal.steel, fontSize: 14 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, borderWidth: 2, borderColor: colors.voice.gold, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  iconText: { color: colors.voice.gold, fontSize: 40, fontWeight: "700", fontFamily: "Georgia" },
  slideTitle: { color: colors.signal.white, fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 16 },
  slideSubtitle: { color: colors.signal.steel, fontSize: 15, lineHeight: 22, textAlign: "center" },
  dots: { flexDirection: "row", gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.depth.elevated },
  dotActive: { backgroundColor: colors.voice.gold, width: 24 },
  nextBtn: { backgroundColor: colors.voice.gold, paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12 },
  nextText: { color: colors.depth.void, fontSize: 16, fontWeight: "600" },
});
