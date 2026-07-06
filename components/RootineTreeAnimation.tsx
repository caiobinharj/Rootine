import React from "react";
import { StyleSheet, View } from "react-native";

import HabitatTree from "./HabitatTree";

export default function RootineTreeAnimation() {
  return (
    <View style={styles.container}>
      <HabitatTree vitalityScore={82} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
